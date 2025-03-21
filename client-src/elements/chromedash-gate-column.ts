import {LitElement, TemplateResult, css, html, nothing} from 'lit';
import {createRef, ref} from 'lit/directives/ref.js';
import './chromedash-activity-log';
import './chromedash-survey-questions';
import {openNaRationaleDialog} from './chromedash-na-rationale-dialog';
import {maybeOpenCertifyDialog} from './chromedash-self-certify-dialog';
import {
  openPreflightDialog,
  somePendingGates,
  somePendingPrereqs,
} from './chromedash-preflight-dialog';
import {maybeOpenPrevoteDialog} from './chromedash-prevote-dialog';
import {GATE_RATIONALE} from './gate-details.js';
import {
  GATE_NA_REQUESTED,
  GATE_PREPARING,
  GATE_REVIEW_REQUESTED,
  VOTE_OPTIONS,
  VOTE_NA_SELF,
  VOTE_NA_VERIFIED,
} from './form-field-enums';
import {
  autolink,
  findProcessStage,
  renderAbsoluteDate,
  renderRelativeDate,
  showToastMessage,
} from './utils.js';

import {customElement, property, state} from 'lit/decorators.js';
import {SHARED_STYLES} from '../css/shared-css.js';
import {Feature, StageDict, User} from '../js-src/cs-client';
import {GateDict} from './chromedash-gate-chip';

interface Vote {
  feature_id: number;
  gate_id: number;
  gate_type?: number;
  state: number;
  set_on: Date;
  set_by: string;
}

export interface ProgressItem {
  name: string;
  field?: string;
  stage: ProcessStage;
}

export interface Action {
  name: string;
  url: string;
  prerequisites: string[];
}

interface ApprovalFieldDef {
  name: string;
  description: string;
  gate_type: number;
  rule: string;
  approvers: string | string[];
  team_name: string;
  escalation_email?: string;
  slo_initial_response?: number;
}

export interface ProcessStage {
  name: string;
  description: string;
  progress_items: ProgressItem[];
  actions: Action[];
  approvals: ApprovalFieldDef[]; // Assuming ApprovalFieldDef is defined somewhere
  incoming_stage: number;
  outgoing_stage: number;
  stage_type?: number;
}

export interface Process {
  name: string;
  description: string;
  applicability: string;
  stages: ProcessStage[];
}

@customElement('chromedash-gate-column')
export class ChromedashGateColumn extends LitElement {
  voteSelectRef = createRef<HTMLSelectElement>();
  commentAreaRef = createRef<HTMLTextAreaElement>();
  postToThreadRef = createRef<HTMLInputElement>();
  assigneeSelectRef = createRef<HTMLSelectElement>();

  static get styles() {
    return [
      ...SHARED_STYLES,
      css`
        #close-button {
          font-size: 2em;
          position: absolute;
          top: var(--content-padding-quarter);
          right: var(--content-padding-quarter);
        }

        #review-status-area {
          margin: var(--content-padding-half) 0;
        }
        .status {
          display: flex;
          gap: var(--content-padding-half);
          align-items: center;
          font-weight: 500;
        }
        sl-icon {
          font-size: 1.3rem;
        }
        .approved {
          color: var(--gate-approved-color);
        }
        .approved sl-icon {
          color: var(--gate-approved-icon-color);
        }
        .denied {
          color: var(--gate-denied-color);
        }
        .denied sl-icon {
          color: var(--gate-denied-icon-color);
        }
        #slo-area sl-icon {
          font-size: 16px;
          vertical-align: text-bottom;
          color: var(--unimportant-text-color);
        }
        .overdue,
        #slo-area .overdue sl-icon {
          color: var(--slo-overdue-color);
        }

        .process-notice {
          margin: var(--content-padding-half) 0;
          padding: var(--content-padding-half);
          background: var(--light-accent-color);
          border-radius: 8px;
        }

        #votes-area {
          margin: var(--content-padding) 0;
        }
        #votes-area table {
          border-spacing: var(--content-padding-half) var(--content-padding);
        }
        #votes-area th {
          font-weight: 500;
        }
        table .your-vote {
          font-style: italic;
          white-space: nowrap;
        }

        .instructions {
          padding: var(--content-padding-half);
          margin-bottom: var(--content-padding-large);
        }

        #controls {
          padding: var(--content-padding);
          text-align: right;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        #controls * + * {
          padding-left: var(--content-padding);
        }
      `,
    ];
  }

  @property({type: Object})
  user!: User;
  @state()
  feature!: Feature;
  @state()
  featureGates!: GateDict[];
  @state()
  stage!: StageDict;
  @state()
  gate!: GateDict;
  @state()
  progress!: ProgressItem;
  @state()
  process!: Process;
  @state()
  votes: Vote[] = [];
  @state()
  comments: string[] = [];
  @state()
  needsSave = false;
  @state()
  showSaved = false;
  @state()
  submittingComment = false;
  @state()
  submittingVote = false;
  @state()
  needsPost = false;
  @state()
  loading = true;

  setContext(feature, stageId, gate) {
    this.loading = true;
    this.feature = feature;
    this.gate = gate;
    const featureId = this.feature.id;
    Promise.all([
      window.csClient.getFeatureProgress(featureId),
      window.csClient.getFeatureProcess(featureId),
      window.csClient.getStage(featureId, stageId),
      window.csClient.getVotes(featureId, null),
      window.csClient.getComments(featureId, gate.id),
    ])
      .then(([progress, process, stage, votesRes, commentRes]) => {
        this.progress = progress;
        this.process = process;
        this.stage = stage;
        this.votes = votesRes.votes.filter(v => v.gate_id == this.gate.id);
        this.comments = commentRes.comments;
        this.needsSave = false;
        this.showSaved = false;
        this.submittingComment = false;
        this.submittingVote = false;
        this.needsPost = false;
        this.loading = false;
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
        this.handleCancel();
      });
  }

  reloadComments() {
    const commentArea = this.commentAreaRef.value;
    if (commentArea) {
      commentArea.value = '';
    }
    this.needsPost = false;
    Promise.all([
      // TODO(jrobbins): Include activities for this gate
      window.csClient.getComments(this.feature.id, this.gate.id),
    ])
      .then(([commentRes]) => {
        this.comments = commentRes.comments;
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
        this.handleCancel();
      });
  }

  /* Reload all data for the currently displayed items. */
  refetch() {
    const featureId = this.feature.id;
    Promise.all([
      window.csClient.getGates(featureId),
      window.csClient.getVotes(featureId, null),
      // TODO(jrobbins): Include activities for this gate
      window.csClient.getComments(featureId, this.gate.id),
    ])
      .then(([gatesRes, votesRes, commentRes]) => {
        for (const g of gatesRes.gates) {
          if (g.id == this.gate.id) this.gate = g;
        }
        this.votes = votesRes.votes.filter(v => v.gate_id == this.gate.id);
        this.comments = commentRes.comments;
        this.needsSave = false;
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
        this.handleCancel();
      });
  }

  _fireEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: true,
      composed: true,
      detail,
    });
    this.dispatchEvent(event);
  }

  checkNeedsPost() {
    let newNeedsPost = false;
    const commentArea = this.commentAreaRef.value;
    const newVal = (commentArea && commentArea.value.trim()) || '';
    if (newVal != '') newNeedsPost = true;
    this.needsPost = newNeedsPost;
  }

  handlePost() {
    const commentArea = this.commentAreaRef.value;
    const commentText = commentArea?.value.trim();
    const postToThreadType = this.postToThreadRef.value?.checked
      ? this.gate.gate_type
      : 0;
    this.postComment(commentText, postToThreadType);
  }

  async postComment(commentText, postToThreadType = 0) {
    this.submittingVote = true;
    if (commentText != '') {
      await window.csClient
        .postComment(
          this.feature.id,
          this.gate.id,
          commentText,
          Number(postToThreadType)
        )
        .then(() => {
          this.reloadComments();
          this.submittingVote = false;
        })
        .catch(() => {
          showToastMessage(
            'Some errors occurred. Please refresh the page or try again later.'
          );
          this.submittingVote = false;
        });
    }
  }

  handleSelectChanged() {
    this.needsSave = true;
    this.showSaved = false;
  }

  saveVote() {
    this.submittingComment = true;
    window.csClient
      .setVote(this.feature.id, this.gate.id, this.voteSelectRef.value?.value)
      .then(() => {
        this.needsSave = false;
        this.showSaved = true;
        this.submittingComment = false;
        this._fireEvent('refetch-needed', {});
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
        this.submittingComment = false;
      });
  }

  handleSave() {
    Promise.all([window.csClient.getGates(this.feature.id)])
      .then(([gatesRes]) => {
        this.featureGates = gatesRes.gates;
        const vote = this.voteSelectRef.value?.value;
        maybeOpenPrevoteDialog(
          this.featureGates,
          this.stage,
          this.gate,
          vote
        ).then(() => {
          this.saveVote();
        });
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
      });
  }

  handleCancel() {
    this._fireEvent('close', {});
  }

  renderHeadingsSkeleton() {
    return html`
      <h3 class="sl-skeleton-header-container" style="width: 60%">
        <sl-skeleton effect="sheen"></sl-skeleton>
      </h3>
      <h2
        class="sl-skeleton-header-container"
        style="margin-top: 4px; width: 75%"
      >
        <sl-skeleton effect="sheen"></sl-skeleton>
      </h2>
    `;
  }

  renderHeadings() {
    const processStage = findProcessStage(this.stage, this.process);
    const processStageName = processStage ? processStage.name : nothing;
    return html`
      <h3>${processStageName}</h3>
      <h2>${this.gate.team_name}</h2>
    `;
  }

  renderReviewStatusSkeleton() {
    return html`
      <h3 class="sl-skeleton-header-container">
        Status: <sl-skeleton effect="sheen"></sl-skeleton>
      </h3>
    `;
  }

  async handleReviewRequested() {
    const featureId = this.feature.id;
    window.csClient.getGates(featureId).then(gatesRes => {
      for (const g of gatesRes.gates) {
        if (g.id == this.gate.id) this.gate = g;
      }

      maybeOpenCertifyDialog(this.gate, VOTE_NA_SELF).then(selfCertifying => {
        if (selfCertifying) {
          this.handleSelfCertify(VOTE_NA_SELF);
        } else {
          this.handleFullReviewRequest();
        }
      });
    });
  }

  async handleNARequested() {
    const featureId = this.feature.id;
    window.csClient.getGates(featureId).then(gatesRes => {
      for (const g of gatesRes.gates) {
        if (g.id == this.gate.id) this.gate = g;
      }

      maybeOpenCertifyDialog(this.gate, VOTE_NA_SELF).then(selfCertifying => {
        if (selfCertifying) {
          this.handleSelfCertify(VOTE_NA_SELF);
        } else {
          this.handleFullNARequested();
        }
      });
    });
  }

  handleFullNARequested() {
    openNaRationaleDialog(this.gate).then(rationale => {
      this.handleNARequestSubmitted(rationale);
    });
  }

  async handleFullReviewRequest() {
    await window.csClient.setVote(
      this.feature.id,
      this.gate.id,
      GATE_REVIEW_REQUESTED
    );
    this._fireEvent('refetch-needed', {});
  }

  async handleSelfCertify(voteValue: number) {
    await window.csClient.setVote(this.feature.id, this.gate.id, voteValue);
    const commentText = 'This "N/A" was self-certified.';
    await this.postComment(commentText);
    this._fireEvent('refetch-needed', {});
  }

  async handleNARequestSubmitted(rationale) {
    await window.csClient.setVote(
      this.feature.id,
      this.gate.id,
      GATE_NA_REQUESTED
    );
    // Post the comment after the review request so that it will go
    // to the assigned reviewer rather than all reviewers.
    const commentText = 'An "N/A" response is requested because: ' + rationale;
    await this.postComment(commentText);
    this._fireEvent('refetch-needed', {});
  }

  /* A user that can edit the current feature can request a review. */
  userCanRequestReview() {
    return (
      this.user &&
      (this.user.can_edit_all ||
        this.user.editable_features.includes(this.feature.id))
    );
  }

  userCanVote() {
    return (
      this.user && this.user.approvable_gate_types.includes(this.gate.gate_type)
    );
  }

  renderAction(processStage, action) {
    const label = action.name;
    const url = action.url
      .replace('{feature_id}', this.feature.id)
      .replace('{gate_id}', this.gate.id || 0);

    const checkCompletion = () => {
      if (
        somePendingPrereqs(action, this.progress) ||
        somePendingGates(this.featureGates, this.stage)
      ) {
        // Open the dialog.
        openPreflightDialog(
          this.feature,
          this.progress,
          this.process,
          action,
          processStage,
          this.stage,
          this.featureGates,
          url
        );
        return;
      } else {
        // Act like user clicked left button to go to the draft email window.
        // Use setTimeout() to prevent safari from blocking the new tab.
        setTimeout(() => {
          const draftWindow = window.open(url, '_blank');
          draftWindow!.focus();
        });
      }
    };

    const loadThenCheckCompletion = () => {
      Promise.all([window.csClient.getGates(this.feature.id)])
        .then(([gatesRes]) => {
          this.featureGates = gatesRes.gates;
          checkCompletion();
        })
        .catch(() => {
          showToastMessage(
            'Some errors occurred. Please refresh the page or try again later.'
          );
        });
    };

    return html`
      <sl-button
        @click=${loadThenCheckCompletion}
        size="small"
        variant="primary"
        >${label}</sl-button
      >
    `;
  }

  renderReviewStatusPreparing() {
    if (!this.userCanRequestReview()) {
      return html` Review has not been requested yet. `;
    }

    const processStage = findProcessStage(this.stage, this.process);
    if (
      processStage?.actions?.length > 0 &&
      this.gate.team_name == 'API Owners'
    ) {
      return processStage.actions.map(act =>
        this.renderAction(processStage, act)
      );
    }

    return html`
      <sl-button
        size="small"
        variant="primary"
        @click=${this.handleReviewRequested}
        >Request review</sl-button
      >
      <sl-button size="small" @click=${this.handleNARequested}
        >Request N/A</sl-button
      >
    `;
  }

  renderReviewStatusNeedsWork() {
    const rereviewButton = !this.userCanRequestReview()
      ? nothing
      : html`
          <div>
            <sl-button
              size="small"
              variant="primary"
              @click=${this.handleReviewRequested}
              >Re-request review</sl-button
            >
          </div>
        `;

    return html`
      <div>Reviewer has indicated a need for rework.</div>
      ${rereviewButton}
    `;
  }

  renderReviewRequest() {
    for (const v of this.votes) {
      if (v.state === GATE_REVIEW_REQUESTED || v.state === GATE_NA_REQUESTED) {
        const shortVoter = v.set_by.split('@')[0] + '@';
        return html`
          ${shortVoter} requested on
          ${renderAbsoluteDate(this.gate.requested_on)}
          ${renderRelativeDate(this.gate.requested_on)}
        `;
      }
    }
    return nothing;
  }

  renderReviewStatusApproved() {
    // TODO(jrobbins): Show date of approval.
    return html`
      <div class="status approved">
        <sl-icon library="material" name="check_circle_filled_20px"></sl-icon>
        Approved
      </div>
    `;
  }

  renderReviewStatusNa() {
    // TODO(jrobbins): Show date of N/a.
    return html`
      <div class="status approved">
        <sl-icon library="material" name="check_circle_filled_20px"></sl-icon>
        N/a
      </div>
    `;
  }

  renderReviewStatusNaSelf() {
    // TODO(jrobbins): Show date of N/a.
    return html`
      <div class="status approved">
        <sl-icon library="material" name="check_circle_filled_20px"></sl-icon>
        N/a (self-certified)
      </div>
    `;
  }

  renderReviewStatusNaVerified() {
    return html`
      <div class="status approved">
        <sl-icon library="material" name="check_circle_filled_20px"></sl-icon>
        N/a (self-certified then verified)
      </div>
    `;
  }

  renderReviewStatusDenied() {
    // TODO(jrobbins): Show date of denial.
    return html`
      <div class="status denied">
        <sl-icon library="material" name="block_20px"></sl-icon>
        Denied
      </div>
    `;
  }

  renderReviewStatus() {
    if (this.gate.state == GATE_PREPARING) {
      return this.renderReviewStatusPreparing();
    } else if (this.gate.state == VOTE_OPTIONS.NEEDS_WORK[0]) {
      return this.renderReviewStatusNeedsWork();
    } else if (this.gate.state == VOTE_OPTIONS.NA[0]) {
      return this.renderReviewStatusNa();
    } else if (this.gate.state == VOTE_NA_SELF) {
      return this.renderReviewStatusNaSelf();
    } else if (this.gate.state == VOTE_NA_VERIFIED) {
      return this.renderReviewStatusNaVerified();
    } else if (this.gate.state == VOTE_OPTIONS.APPROVED[0]) {
      return this.renderReviewStatusApproved();
    } else if (this.gate.state == VOTE_OPTIONS.DENIED[0]) {
      return this.renderReviewStatusDenied();
    } else {
      return nothing;
    }
  }

  renderSLOStatusSkeleton() {
    return html`
      <details>
        <summary>SLO initial response:</summary>
        Loading...
      </details>
      <details>
        <summary>SLO resolution:</summary>
        Loading...
      </details>
    `;
  }

  dayPhrase(count) {
    return String(count) + (count == 1 ? ' day' : ' days');
  }

  renderSLOSummary(limit: number, remaining: number, took: number) {
    if (typeof took === 'number') {
      return html`took ${this.dayPhrase(took)}`;
    } else if (typeof remaining === 'number') {
      let msg = html`due today`;
      let className = '';
      if (remaining > 0) {
        msg = html`${this.dayPhrase(remaining)} remaining`;
      } else if (remaining < 0) {
        className = 'overdue';
        msg = html`${this.dayPhrase(-remaining)} overdue`;
      }
      return html`
        <span class="${className}">
          <sl-icon library="material" name="clock_loader_60_20px"></sl-icon>
          ${msg}
        </span>
      `;
    } else if (typeof limit === 'number') {
      return html`${this.dayPhrase(limit)} allowed`;
    }
    return nothing;
  }

  renderSLOStatus() {
    const initialLimit = this.gate?.slo_initial_response;
    const initialRemaining = this.gate?.slo_initial_response_remaining;
    const initialTook = this.gate?.slo_initial_response_took;
    const resolveLimit = this.gate?.slo_resolve;
    const resolveRemaining = this.gate?.slo_resolve_remaining;
    const resolveTook = this.gate?.slo_resolve_took;
    const needsWorkStartedOn = this.gate?.needs_work_started_on;

    const initialLine = html`
      <details>
        <summary>
          SLO initial response:
          ${this.renderSLOSummary(initialLimit, initialRemaining, initialTook)}
        </summary>
        Reviewers are encouraged to provide an initial review status update or a
        comment within this number of weekdays.
      </details>
    `;
    let resolveLine: TemplateResult | typeof nothing = html`
      <details>
        <summary>
          SLO resolution:
          ${this.renderSLOSummary(resolveLimit, resolveRemaining, resolveTook)}
        </summary>
        Reviewers are encouraged to resolve the review within this number of
        weekdays. If a reviewer responds with "Needs work", this clock pauses
        until a feature owner clicks "Re-request review".
      </details>
    `;
    let needsWorkLine: TemplateResult | typeof nothing = nothing;
    if (typeof needsWorkStartedOn === 'string') {
      resolveLine = nothing;
      needsWorkLine = html`
        <details>
          <summary>
            SLO resolution: Needs work since ${needsWorkStartedOn.split(' ')[0]}
          </summary>
          A reviewer has asked the feature owner to do needed work. Check the
          comments for a description of the needed work. The SLO clock is paused
          until a feature owner clicks "Re-request review".
        </details>
      `;
    }

    return html`${initialLine} ${resolveLine} ${needsWorkLine}`;
  }

  renderGateRationale() {
    const rationale = GATE_RATIONALE[this.gate?.gate_type];
    if (!rationale) return nothing;
    return html`
      <details>
        <summary>Why this gate?</summary>
        ${rationale}
      </details>
    `;
  }

  renderWarnings() {
    if (this.gate && ['Privacy', 'WP Security'].includes(this.gate.team_name)) {
      return html`
        <div class="process-notice">
          Googlers: Please follow the instructions at
          <a
            href="https://goto.corp.google.com/wp-launch-guidelines"
            target="_blank"
            rel="noopener"
            >go/wp-launch-guidelines</a
          >
          (internal document) to determine whether you also require an internal
          review.
        </div>
      `;
    }
    return nothing;
  }

  renderVotesSkeleton() {
    return html`
      <table>
        <tr>
          <th>Reviewer</th>
          <th>Review status</th>
        </tr>
        <tr>
          <td><sl-skeleton effect="sheen"></sl-skeleton></td>
          <td><sl-skeleton effect="sheen"></sl-skeleton></td>
        </tr>
      </table>
    `;
  }

  findStateName(state) {
    if (state == GATE_REVIEW_REQUESTED) {
      return 'Review requested';
    }
    if (state == VOTE_NA_SELF) {
      return 'N/a (self-certified)';
    }
    if (state == VOTE_NA_VERIFIED) {
      return 'N/a (verified)';
    }
    for (const item of Object.values(VOTE_OPTIONS)) {
      if (item[0] == state) {
        return item[1];
      }
    }

    // This should not normally be seen by users, but it will help us
    // cope with data migration.
    return `State ${state}`;
  }

  renderVoteReadOnly(vote) {
    // TODO(jrobbins): background colors
    return this.findStateName(vote.state);
  }

  renderVoteMenu(state) {
    // hoist is needed when <sl-select> is in overflow:auto context.
    return html`
      <sl-select
        name="${this.gate.id}"
        value="${state}"
        ${ref(this.voteSelectRef)}
        @sl-change=${this.handleSelectChanged}
        hoist
        size="small"
      >
        ${this.votes.some(
          v => v.state === VOTE_NA_SELF || v.state === VOTE_NA_VERIFIED
        )
          ? html` <sl-option value="${VOTE_NA_VERIFIED}"
              >N/a verified</sl-option
            >`
          : nothing}
        ${Object.values(VOTE_OPTIONS).map(
          valName =>
            html` <sl-option value="${valName[0]}">${valName[1]}</sl-option>`
        )}
      </sl-select>
    `;
  }

  renderSaveButton() {
    return html`
      <sl-button
        size="small"
        variant="primary"
        @click=${this.handleSave}
        ?disabled=${this.submittingComment}
        >Save</sl-button
      >
    `;
  }

  renderVoteRow(vote, canVote) {
    const shortVoter = vote.set_by.split('@')[0] + '@';
    let saveButton: typeof nothing | TemplateResult = nothing;
    let voteCell: TemplateResult | string = this.renderVoteReadOnly(vote);

    if (canVote && vote.set_by == this.user?.email) {
      voteCell = this.renderVoteMenu(vote.state);
      if (this.needsSave) {
        saveButton = this.renderSaveButton();
      } else if (this.showSaved) {
        saveButton = html`<b>Saved</b>`;
      }
    }

    return html`
      <tr>
        <td title=${vote.set_by}>${shortVoter}</td>
        <td>${voteCell}</td>
        <td>${saveButton}</td>
      </tr>
    `;
  }

  renderAddVoteRow() {
    const assignedToMe = this.gate.assignee_emails.includes(this.user.email);
    const shortVoter = this.user.email.split('@')[0] + '@';
    const yourLabel = assignedToMe
      ? html`<td title=${this.user.email}>${shortVoter}</td>`
      : html`<td class="your-vote">Awaiting review</td>`;
    const voteCell = this.renderVoteMenu(VOTE_OPTIONS.NO_RESPONSE[0]);
    const saveButton = this.needsSave ? this.renderSaveButton() : nothing;
    return html`
      <tr>
        ${yourLabel}
        <td>${voteCell}</td>
        <td>${saveButton}</td>
      </tr>
    `;
  }

  renderPendingVote(assigneeEmail) {
    const shortVoter = assigneeEmail.split('@')[0] + '@';
    return html`
      <tr>
        <td title=${assigneeEmail}>${shortVoter}</td>
        <td>No response yet</td>
        <td></td>
      </tr>
    `;
  }

  saveAssignedReviewer() {
    const assignee = this.assigneeSelectRef.value?.value;
    const assigneeList = assignee === '' ? [] : [assignee];
    window.csClient
      .updateGate(this.feature.id, this.gate.id, assigneeList)
      .then(() => this._fireEvent('refetch-needed', {}));
  }

  renderAssignReviewerControls() {
    if (!this.userCanRequestReview() && !this.userCanVote()) {
      return nothing;
    }
    if (this.gate.state === VOTE_OPTIONS.APPROVED[0]) {
      return nothing;
    }
    const currentAssignee =
      this.gate.assignee_emails?.length > 0 ? this.gate.assignee_emails[0] : '';
    return html`
      <details>
        <summary>Assign a reviewer</summary>
        <sl-select
          hoist
          size="small"
          ${ref(this.assigneeSelectRef)}
          value=${currentAssignee}
        >
          <sl-option value="">None</sl-option>
          ${this.gate.possible_assignee_emails.map(
            email => html` <sl-option value="${email}">${email}</sl-option>`
          )}
        </sl-select>
        <sl-button
          size="small"
          variant="primary"
          @click=${() => this.saveAssignedReviewer()}
          >Assign</sl-button
        >
      </details>
    `;
  }

  isReviewRequest(vote) {
    return (
      vote.state === GATE_REVIEW_REQUESTED || vote.state === GATE_NA_REQUESTED
    );
  }

  renderVotes() {
    const canVote = this.userCanVote();
    const responses = this.votes.filter(v => !this.isReviewRequest(v));
    const responseEmails = responses.map(v => v.set_by);
    const othersPending = this.gate.assignee_emails.filter(
      ae => !responseEmails.includes(ae) && ae != this.user?.email
    );
    const myResponseExists = responses.some(v => v.set_by == this.user?.email);
    const addVoteRow =
      canVote && !myResponseExists ? this.renderAddVoteRow() : nothing;
    const assignControls = this.renderAssignReviewerControls();

    if (!canVote && responses.length === 0 && othersPending.length === 0) {
      return html`
        <p>No review activity yet.</p>
        ${assignControls}
      `;
    }

    return html`
      <table>
        <tr>
          <th>Reviewer</th>
          <th>Review status</th>
        </tr>
        ${responses.map(v => this.renderVoteRow(v, canVote))}
        ${othersPending.map(ae => this.renderPendingVote(ae))} ${addVoteRow}
      </table>
      ${assignControls}
    `;
  }

  renderCommentsSkeleton() {
    return html`
      <h2>Comments</h2>
      <sl-skeleton effect="sheen"></sl-skeleton>
    `;
  }

  gateHasIntentThread() {
    return this.gate.team_name === 'API Owners';
  }

  canPostTo(threadArchiveUrl) {
    return (
      threadArchiveUrl &&
      (threadArchiveUrl.startsWith(
        'https://groups.google.com/a/chromium.org/d/msgid/blink-dev/'
      ) ||
        threadArchiveUrl.startsWith(
          'https://groups.google.com/d/msgid/jrobbins-test'
        ))
    );
  }

  renderControls() {
    const canComment = this.user?.can_comment || this.userCanRequestReview();
    if (!canComment) return nothing;

    const postButton = html`
      <sl-button
        variant="primary"
        @click=${this.handlePost}
        ?disabled=${!this.needsPost || this.submittingVote}
        size="small"
        >Post</sl-button
      >
    `;
    const checkboxLabel = this.stage.intent_thread_url
      ? html`
          Also post to
          <a href=${this.stage.intent_thread_url} target="_blank"
            >intent thread</a
          >
        `
      : 'Also post to intent thread';
    const postToThreadCheckbox = this.gateHasIntentThread()
      ? html`
          <sl-checkbox
            ${ref(this.postToThreadRef)}
            ?disabled=${!this.canPostTo(this.stage.intent_thread_url)}
            size="small"
            >${checkboxLabel}</sl-checkbox
          >
        `
      : nothing;
    const escalation = this.gate.escalation_email
      ? html`If needed, you can
          <a href="mailto:${this.gate.escalation_email}" target="_blank"
            >email the team directly</a
          >.`
      : nothing;

    return html`
      <sl-textarea
        id="comment_area"
        rows="2"
        cols="40"
        ${ref(this.commentAreaRef)}
        @sl-change=${this.checkNeedsPost}
        @keypress=${this.checkNeedsPost}
        placeholder="Add a comment"
      ></sl-textarea>
      <div id="controls">${postButton} ${postToThreadCheckbox}</div>
      <div class="instructions">
        Comments will be visible publicly. Only reviewers will be notified when
        a comment is posted. ${escalation}
      </div>
    `;
  }

  renderComments() {
    // TODO(jrobbins): Include relevant activities too.
    return html`
      <h2>Comments</h2>
      ${this.renderControls()}
      <chromedash-activity-log
        .user=${this.user}
        .featureId=${this.feature.id}
        .narrow=${true}
        .reverse=${true}
        .comments=${this.comments}
      >
      </chromedash-activity-log>
    `;
  }

  render() {
    return html`
      <sl-icon-button
        title="Close"
        name="x"
        id="close-button"
        @click=${() => this.handleCancel()}
      ></sl-icon-button>

      ${this.loading ? this.renderHeadingsSkeleton() : this.renderHeadings()}

      <div id="review-status-area">
        ${this.loading
          ? this.renderReviewStatusSkeleton()
          : this.renderReviewStatus()}
        ${this.renderReviewRequest()}
      </div>
      <div id="slo-area">
        ${this.loading
          ? this.renderSLOStatusSkeleton()
          : this.renderSLOStatus()}
        ${this.renderGateRationale()}
      </div>

      ${this.renderWarnings()}

      <div id="votes-area">
        ${this.loading ? this.renderVotesSkeleton() : this.renderVotes()}
      </div>

      <chromedash-survey-questions
        .loading=${this.loading}
        .user=${this.user}
        .feature=${this.feature}
        .gate=${this.gate}
      ></chromedash-survey-questions>
      ${this.loading ? this.renderCommentsSkeleton() : this.renderComments()}
    `;
  }
}
