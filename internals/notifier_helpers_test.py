# Copyright 2022 Google Inc.
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
from unittest import mock

from api import converters
from internals import notifier_helpers
import testing_config  # Must be imported before the module under test.
from internals.core_models import FeatureEntry, Stage, MilestoneSet
from internals.data_types import CHANGED_FIELDS_LIST_TYPE
from internals.review_models import Activity, Vote, Gate

class ActivityTest(testing_config.CustomTestCase):

  def setUp(self):
    self.feature_1 = FeatureEntry(
        id=111, name='feature a', summary='sum', category=1,
        owner_emails=['feature_owner@example.com'])
    self.feature_1.put()
    self.feature_id = self.feature_1.key.integer_id()

    self.gate_1 = Gate(id=123, feature_id=self.feature_id, stage_id=321,
        gate_type=1, state=Vote.NA)
    self.gate_1.put()
    self.gate_1_id = self.gate_1.key.integer_id()

    self.stage = Stage(
        id=321,
        feature_id=self.feature_id,
        stage_type=120,
        milestones=MilestoneSet(desktop_first=99))
    self.stage.put()

    testing_config.sign_in('one@example.com', 123567890)

  def tearDown(self):
    for activity in Activity.query():
      activity.key.delete()
    self.feature_1.key.delete()
    self.gate_1.key.delete()
    self.stage.key.delete()
    testing_config.sign_out()

  def test_activities__created(self):
    changed_fields_1: CHANGED_FIELDS_LIST_TYPE = [
        ('name', 'feature a', 'feature Z'),
        ('summary', 'sum', 'A new and more accurate summary.'),
        ('shipped_milestone', 1, 100)]
    changed_fields_2: CHANGED_FIELDS_LIST_TYPE = [('category', 1, 2)]
    notifier_helpers.notify_subscribers_and_save_amendments(
        self.feature_1, changed_fields_1)
    notifier_helpers.notify_subscribers_and_save_amendments(
        self.feature_1, changed_fields_2)
    feature_id = self.feature_1.key.integer_id()
    activities = Activity.get_activities(feature_id)
    self.assertEqual(len(activities), 2)
    self.assertEqual(len(activities[0].amendments), 3)
    self.assertEqual(len(activities[1].amendments), 1)

    act_1 = activities[0]
    for i, (field, old_val, new_val) in enumerate(changed_fields_1):
      self.assertEqual(field, act_1.amendments[i].field_name)
      self.assertEqual(str(old_val), act_1.amendments[i].old_value)
      self.assertEqual(str(new_val), act_1.amendments[i].new_value)

  def test_activities_created__no_changes(self):
    """No Activity should be logged if submitted with no changes."""
    changed_fields: CHANGED_FIELDS_LIST_TYPE = []
    notifier_helpers.notify_subscribers_and_save_amendments(
        self.feature_1, changed_fields)

    feature_id = self.feature_1.key.integer_id()
    activities = Activity.get_activities(feature_id)
    self.assertEqual(len(activities), 0)

  def test_activities_created__empty_list_not_created(self):
    """No amendment should be logged if the value moved from None to empty list."""
    changed_fields: CHANGED_FIELDS_LIST_TYPE = [('editor_emails', None, [])]
    notifier_helpers.notify_subscribers_and_save_amendments(
        self.feature_1, changed_fields)

    activities = Activity.get_activities(self.feature_1.key.integer_id())
    # No activity entity created.
    self.assertTrue(len(activities) == 0)

  @mock.patch('framework.cloud_tasks_helpers.enqueue_task')
  def test_vote_changes_activities__created(self, mock_task_helpers):
    notifier_helpers.notify_subscribers_of_vote_changes(
        self.feature_1, self.gate_1, 'abc@example.com', Vote.DENIED, Vote.NA)
    expected_content = ('abc@example.com set review status for stage'
                ': Start prototyping, gate: Intent to Prototype to denied.')
    feature_id = self.feature_1.key.integer_id()
    activities = Activity.get_activities(feature_id)
    self.assertEqual(len(activities), 1)
    self.assertEqual(activities[0].feature_id, feature_id)
    self.assertEqual(activities[0].gate_id, self.gate_1_id)
    self.assertEqual(activities[0].author, 'abc@example.com')
    self.assertEqual(activities[0].content, None)
    amendments = activities[0].amendments
    self.assertEqual(len(amendments), 1)
    self.assertEqual(amendments[0].field_name, 'review_status')
    self.assertEqual(amendments[0].old_value, 'na')
    self.assertEqual(amendments[0].new_value, 'denied')

    mock_task_helpers.assert_called_once()

  @mock.patch('framework.cloud_tasks_helpers.enqueue_task')
  def test_vote_changes_activities__needs_work_note(self, mock_task_helpers):
    """When we notify about NEEDS_WORK, it has a process note."""
    notifier_helpers.notify_subscribers_of_vote_changes(
        self.feature_1, self.gate_1, 'abc@example.com',
        Vote.NEEDS_WORK, Vote.NA)

    prop_change = {
        'prop_name': 'API Owners review status http://127.0.0.1:7777/feature/111?gate=123',
        'old_val': 'na',
        'new_val': 'needs_work',
        'note': 'Feature owners must press the "Re-request review" button after requested changes have been completed.',
        }
    expected_params = {
        'changes': [prop_change],
        'is_update': True,
        'triggering_user_email': 'abc@example.com',
        'feature': converters.feature_entry_to_json_verbose(self.feature_1),
        }
    mock_task_helpers.assert_called_once_with(
        '/tasks/email-subscribers', expected_params)

  @mock.patch('framework.cloud_tasks_helpers.enqueue_task')
  def test_notify_subscribers_of_new_comments(self, mock_task_helpers):
    notifier_helpers.notify_subscribers_of_new_comments(
        self.feature_1, self.gate_1, 'abc@example.com', 'fake comments')

    mock_task_helpers.assert_called_once()


class NotifierHelpersTest(testing_config.CustomTestCase):
  def setUp(self):
    self.feature_1 = FeatureEntry(
        name='feature a', summary='sum', category=1,
        owner_emails=['feature_owner@example.com',
                      'feature_owner2@example.com'])
    self.feature_1.put()

    feature_id = self.feature_1.key.integer_id()
    self.ot_stage = Stage(
        id=123,
        feature_id=feature_id,
        stage_type=150)
    self.extension_stage = Stage(
        id=456,
        feature_id=feature_id,
        stage_type=151)
    self.ot_stage.put()
    self.extension_stage.put()
    
    self.gate_1 = Gate(id=123, feature_id=feature_id, stage_id=123,
        gate_type=2, state=Vote.APPROVED)
    self.gate_1.put()

    self.gate_2 = Gate(id=123, feature_id=feature_id, stage_id=123,
        gate_type=2, state=Vote.NA)
    self.gate_2.put()

    self.gate_3 = Gate(id=123, feature_id=feature_id, stage_id=456,
        gate_type=3, state=Vote.APPROVED)
    self.gate_3.put()

  def tearDown(self):
    for kind in [FeatureEntry, Stage, Gate]:
      for entity in kind.query():
        entity.key.delete()
  
  @mock.patch(
      'internals.notifier_helpers.send_trial_creation_approved_notification')
  def test_notify_approvals__creation(self, mock_sender):
    """OT creation approval notification is sent when all gates are approved."""
    notifier_helpers.notify_approvals(
        self.feature_1, self.ot_stage,self.gate_1)
    mock_sender.assert_called_once()

  @mock.patch(
      'internals.notifier_helpers.send_trial_creation_approved_notification')
  def test_notify_approvals__creation_gates_unapproved(self, mock_sender):
    """OT creation approval notification is only sent if all gates are
    approved."""
    # A separate gate related to the OT stage is not approved.
    self.gate_2.state = Vote.DENIED
    self.gate_2.put()
    notifier_helpers.notify_approvals(
        self.feature_1, self.ot_stage, self.gate_1)
    mock_sender.assert_not_called()

  @mock.patch(
      'internals.notifier_helpers.send_trial_extension_approved_notification')
  def test_notify_approvals__extension(self, mock_sender):
    """OT extension approved notification sent when gate is approved."""
    notifier_helpers.notify_approvals(
        self.feature_1, self.extension_stage, self.gate_3)
    mock_sender.assert_called_once()
