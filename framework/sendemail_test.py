# Copyright 2021 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License")
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import email
import collections
import flask
import json
import testing_config  # Must be imported before the module under test.
import werkzeug.exceptions  # Flask HTTP stuff.
from unittest import mock

from google.appengine.api import mail

import settings
from framework import cloud_tasks_helpers
from framework import sendemail
from internals.user_models import UserPref


test_app = flask.Flask(__name__)

class FunctionTests(testing_config.CustomTestCase):

  def test_get_param__simple(self):
    """We can simply get a JSON parameter, with defaults."""
    with test_app.test_request_context('/test', json={'x': 1}):
      self.assertEqual(
          1,
          sendemail.get_param(flask.request, 'x'))
      self.assertEqual(
          None,
          sendemail.get_param(flask.request, 'missing', required=False))

  @mock.patch('flask.abort')
  def test_get_param__missing_required(self, mock_abort):
    """If a required param is missing, we abort."""
    mock_abort.side_effect = werkzeug.exceptions.BadRequest

    with test_app.test_request_context('/test', json={'x': 1}):
      with self.assertRaises(werkzeug.exceptions.BadRequest):
        sendemail.get_param(flask.request, 'missing')
    mock_abort.assert_called_once_with(
        400, description="Missing parameter 'missing'")


class OutboundEmailHandlerTest(testing_config.CustomTestCase):

  def setUp(self):
    self.request_path = '/tasks/outbound-email'

    self.to = 'user@example.com'
    self.subject = 'test subject'
    self.cc = ['another_user@example.com']
    self.html = '<b>body</b>'
    self.sender = ('Chromestatus <admin@%s.appspotmail.com>' %
                   settings.APP_ID)
    self.refs = 'fake-message-id-of-previous-message'

  @mock.patch('settings.SEND_EMAIL', True)
  @mock.patch('settings.SEND_ALL_EMAIL_TO', None)
  @mock.patch('google.appengine.api.mail.EmailMessage')
  def test_post__prod(self, mock_emailmessage_constructor):
    """On cr-status, we send emails to real users."""
    params = {
        'to': self.to,
        'cc': self.cc,
        'subject': self.subject,
        'html': self.html,
        'references': self.refs,
        }
    with test_app.test_request_context(self.request_path, json=params):
      actual_response = sendemail.handle_outbound_mail_task()

    mock_emailmessage_constructor.assert_called_once_with(
        sender=self.sender, to=[self.to], subject=self.subject,
        html=self.html)
    mock_message = mock_emailmessage_constructor.return_value
    mock_message.check_initialized.assert_called_once_with()
    mock_message.send.assert_called_once_with()
    self.assertEqual({'message': 'Done'}, actual_response)
    self.assertEqual(self.refs, mock_message.headers['References'])
    self.assertEqual(self.refs, mock_message.headers['In-Reply-To'])
    self.assertEqual(self.cc, mock_message.cc)

  @mock.patch('settings.SEND_EMAIL', True)
  @mock.patch('google.appengine.api.mail.EmailMessage')
  def test_post__staging(self, mock_emailmessage_constructor):
    """On cr-status-staging, we send emails to an archive."""
    params = {
        'to': self.to,
        'cc': self.cc,
        'subject': self.subject,
        'html': self.html,
        }
    with test_app.test_request_context(self.request_path, json=params):
      actual_response = sendemail.handle_outbound_mail_task()

    expected_to = 'cr-status-staging-emails+user+example.com@google.com'
    mock_emailmessage_constructor.assert_called_once_with(
        sender=self.sender, to=[expected_to], subject=self.subject,
        html=self.html)
    mock_message = mock_emailmessage_constructor.return_value
    mock_message.check_initialized.assert_called_once_with()
    mock_message.send.assert_called_once_with()
    self.assertEqual({'message': 'Done'}, actual_response)

  @mock.patch('settings.SEND_EMAIL', False)
  @mock.patch('google.appengine.api.mail.EmailMessage')
  def test_post__local(self, mock_emailmessage_constructor):
    """When running locally, we don't actually send emails."""
    params = {
        'to': self.to,
        'cc': self.cc,
        'subject': self.subject,
        'html': self.html,
        }
    with test_app.test_request_context(self.request_path, json=params):
      actual_response = sendemail.handle_outbound_mail_task()

    expected_to = 'cr-status-staging-emails+user+example.com@google.com'
    expected_cc = [
        'cr-status-staging-cc-emails+another_user+example.com@google.com']
    mock_emailmessage_constructor.assert_called_once_with(
        sender=self.sender, to=[expected_to], subject=self.subject,
        html=self.html)
    mock_message = mock_emailmessage_constructor.return_value
    mock_message.check_initialized.assert_called_once_with()
    mock_message.send.assert_not_called()
    self.assertEqual(expected_cc, mock_message.cc)
    self.assertEqual({'message': 'Done'}, actual_response)


class BouncedEmailHandlerTest(testing_config.CustomTestCase):

  def setUp(self):
    self.sender = ('Chromestatus <admin@%s.appspotmail.com>' %
                   settings.APP_ID)
    self.expected_to = settings.BOUNCE_ESCALATION_ADDR

  @mock.patch('framework.sendemail.receive')
  def test_process_post_data(self, mock_receive):
    with test_app.test_request_context('/_ah/bounce'):
      actual_json = sendemail.handle_bounce()

    self.assertEqual({'message': 'Done'}, actual_json)
    mock_receive.assert_called_once()


  @mock.patch('settings.SEND_EMAIL', True)
  @mock.patch('google.appengine.api.mail.EmailMessage')
  def test_receive__user_has_prefs(self, mock_emailmessage_constructor):
    """When we get a bounce, we update the UserPrefs for that user."""
    starrer_3_pref = UserPref(
        email='starrer_3@example.com',
        notify_as_starrer=False)
    starrer_3_pref.put()

    bounce_message = testing_config.Blank(
        original={'to': 'starrer_3@example.com',
                  'from': 'sender',
                  'subject': 'subject',
                  'text': 'body'})

    sendemail.receive(bounce_message)

    updated_pref = UserPref.get_by_id(starrer_3_pref.key.integer_id())
    self.assertEqual('starrer_3@example.com', updated_pref.email)
    self.assertTrue(updated_pref.bounced)
    self.assertFalse(updated_pref.notify_as_starrer)

    expected_subject = "Mail to 'starrer_3@example.com' bounced"
    mock_emailmessage_constructor.assert_called_once_with(
        sender=self.sender, to=self.expected_to, subject=expected_subject,
        body=mock.ANY)
    mock_message = mock_emailmessage_constructor.return_value
    mock_message.check_initialized.assert_called_once_with()
    mock_message.send.assert_called()

  @mock.patch('settings.SEND_EMAIL', True)
  @mock.patch('google.appengine.api.mail.EmailMessage')
  def test_receive__create_prefs(self, mock_emailmessage_constructor):
    """When we get a bounce, we create the UserPrefs for that user."""
    # Note, no existing UserPref for starrer_4.

    bounce_message = testing_config.Blank(
        original={'to': 'starrer_4@example.com',
                  'from': 'sender',
                  'subject': 'subject',
                  'text': 'body'})

    sendemail.receive(bounce_message)

    prefs_list = UserPref.get_prefs_for_emails(['starrer_4@example.com'])
    updated_pref = prefs_list[0]
    self.assertEqual('starrer_4@example.com', updated_pref.email)
    self.assertTrue(updated_pref.bounced)
    self.assertTrue(updated_pref.notify_as_starrer)

    expected_subject = "Mail to 'starrer_4@example.com' bounced"
    mock_emailmessage_constructor.assert_called_once_with(
        sender=self.sender, to=self.expected_to, subject=expected_subject,
        body=mock.ANY)
    mock_message = mock_emailmessage_constructor.return_value
    mock_message.check_initialized.assert_called_once_with()
    mock_message.send.assert_called()


class FunctionTest(testing_config.CustomTestCase):

  def test_extract_addrs(self):
    """We can parse email From: lines."""
    header_val = ''
    self.assertEqual(
        [], sendemail._extract_addrs(header_val))

    header_val = [
        'J. Robbins <a@b.com>', 'c@d.com', 'Nick "Name" Dude <e@f.com>']
    self.assertEqual(
        ['a@b.com', 'c@d.com', 'e@f.com'],
        sendemail._extract_addrs(header_val))


def MakeMessage(header_list, body):
  """Convenience function to make an email.message.Message."""
  msg = email.message.Message()
  for key, value in header_list:
    msg.add_header(key, value)
  msg.set_payload(body)
  return msg


HEADER_LINES = [
    ('X-Original-From', 'user@example.com'),
    ('From', 'mailing-list@example.com'),
    ('To', settings.INBOUND_EMAIL_ADDR),
    ('Cc', 'other@chromium.org'),
    ('Subject', 'Intent to Ship: Featurename'),
    ('In-Reply-To', 'fake message id'),
    ]


class InboundEmailHandlerTest(testing_config.CustomTestCase):

  def test_handle_incoming_mail__wrong_to_addr(self):
    """Reject the email if the app was not on the To: line."""
    with test_app.test_request_context('/_ah/mail/other@example.com'):
      actual = sendemail.handle_incoming_mail('other@example.com')

    self.assertEqual(
        {'message': 'Wrong address'},
        actual)

  def test_handle_incoming_mail__too_big(self):
    """Reject the incoming email if it is huge."""
    data = b'x' * sendemail.MAX_BODY_SIZE + b' is too big'

    with test_app.test_request_context(
        '/_ah/mail/%s' % settings.INBOUND_EMAIL_ADDR, data=data):
      actual = sendemail.handle_incoming_mail(settings.INBOUND_EMAIL_ADDR)

    self.assertEqual(
        {'message': 'Too big'},
        actual)

  @mock.patch('framework.sendemail.get_incoming_message')
  def test_handle_incoming_mail__junk_mail(self, mock_get_incoming_message):
    """Reject the incoming email if it has the wrong precedence header."""
    for precedence in ['Bulk', 'Junk']:
      msg = MakeMessage(
          HEADER_LINES + [('Precedence', precedence)],
          'I am on vacation!')
      mock_get_incoming_message.return_value = msg

      with test_app.test_request_context(
          '/_ah/mail/%s' % settings.INBOUND_EMAIL_ADDR, data='fake msg'):
        actual = sendemail.handle_incoming_mail(settings.INBOUND_EMAIL_ADDR)

      self.assertEqual(
          {'message': 'Wrong precedence'},
          actual)

  @mock.patch('framework.sendemail.get_incoming_message')
  def test_handle_incoming_mail__unclear_from(self, mock_get_incoming_message):
    """Reject the incoming email if it we cannot parse the From: line."""
    msg = MakeMessage([], 'Guess who this is')
    mock_get_incoming_message.return_value = msg

    with test_app.test_request_context(
        '/_ah/mail/%s' % settings.INBOUND_EMAIL_ADDR, data='fake msg'):
      actual = sendemail.handle_incoming_mail(settings.INBOUND_EMAIL_ADDR)

    self.assertEqual(
        {'message': 'Missing From'},
        actual)

  @mock.patch('framework.cloud_tasks_helpers.enqueue_task')
  @mock.patch('framework.sendemail.get_incoming_message')
  def test_handle_incoming_mail__normal(
      self, mock_get_incoming_message, mock_enqueue_task):
    """A valid incoming email is handed off to detect-intent task."""
    msg = MakeMessage(HEADER_LINES, 'Please review')
    mock_get_incoming_message.return_value = msg

    with test_app.test_request_context(
        '/_ah/mail/%s' % settings.INBOUND_EMAIL_ADDR, data='fake msg'):
      actual = sendemail.handle_incoming_mail(settings.INBOUND_EMAIL_ADDR)

    self.assertEqual({'message': 'Done'}, actual)
    expected_task_dict = {
      'to_addr': settings.INBOUND_EMAIL_ADDR,
      'from_addr': 'user@example.com',
      'subject': 'Intent to Ship: Featurename',
      'in_reply_to': 'fake message id',
      'body': 'Please review',
    }
    mock_enqueue_task.assert_called_once_with(
        '/tasks/detect-intent', expected_task_dict)

  @mock.patch('framework.cloud_tasks_helpers.enqueue_task')
  @mock.patch('framework.sendemail.get_incoming_message')
  def test_handle_incoming_mail__fallback_to_mailing_list(
      self, mock_get_incoming_message, mock_enqueue_task):
    """If there is no personal X-Original-From, use the mailing list From:."""
    msg = MakeMessage(HEADER_LINES, 'Please review')
    del msg['X-Original-From']
    mock_get_incoming_message.return_value = msg

    with test_app.test_request_context(
        '/_ah/mail/%s' % settings.INBOUND_EMAIL_ADDR, data='fake msg'):
      actual = sendemail.handle_incoming_mail(settings.INBOUND_EMAIL_ADDR)

    self.assertEqual({'message': 'Done'}, actual)
    expected_task_dict = {
      'to_addr': settings.INBOUND_EMAIL_ADDR,
      'from_addr': 'mailing-list@example.com',
      'subject': 'Intent to Ship: Featurename',
      'in_reply_to': 'fake message id',
      'body': 'Please review',
    }
    mock_enqueue_task.assert_called_once_with(
        '/tasks/detect-intent', expected_task_dict)
