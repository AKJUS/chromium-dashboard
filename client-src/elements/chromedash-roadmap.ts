import '@polymer/iron-icon';
import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import {SHARED_STYLES} from '../css/shared-css.js';
import {Channels, Feature} from '../js-src/cs-client.js';
import {TemplateContent} from './chromedash-roadmap-milestone-card.js';
import {showToastMessage} from './utils.js';

interface MilestoneDetails {
  branch_point: string;
  earliest_beta: string;
  earliest_beta_chromeos: string;
  earliest_beta_ios: string;
  feature_freeze: string;
  final_beta: string;
  final_beta_cut: string;
  late_stable_date: string;
  latest_beta: string;
  ldaps: Record<string, string>;
  ltc_date: string;
  ltr_date: string;
  ltr_last_refresh_date: string;
  mstone: number;
  owners: Record<string, string>;
  stable_cut: string;
  stable_cut_ios: string;
  stable_date: string;
  stable_refresh_first: string;
  stable_refresh_second: string;
  stable_refresh_third: string;
  version: number;
  features: Feature[];
}

interface MilestoneInfo {
  [milestone: number]: MilestoneDetails;
}

const TEMPLATE_CONTENT: Record<string, TemplateContent> = {
  stable_minus_one: {
    channelLabel: 'Released',
    h1Class: '',
    dateText: 'was',
    featureHeader: 'Features in this release',
  },
  stable: {
    channelLabel: 'Stable',
    h1Class: '',
    dateText: 'was',
    featureHeader: 'Features in this release',
  },
  stable_soon: {
    channelLabel: 'Stable soon',
    h1Class: '',
    dateText: 'was',
    featureHeader: 'Features planned in this release',
  },
  beta: {
    channelLabel: 'Next up',
    h1Class: 'chrome_version--beta',
    channelTag: 'BETA',
    dateText: 'between',
    featureHeader: 'Features planned in this release',
  },
  dev: {
    channelLabel: 'Dev',
    h1Class: 'chrome_version--dev',
    channelTag: 'DEV',
    dateText: 'coming',
    featureHeader: 'Features planned in this release',
  },
  dev_plus_one: {
    channelLabel: 'Later',
    h1Class: 'chrome_version--dev_plus_one',
    dateText: 'coming',
    featureHeader: 'Features planned in this release',
  },
};
const DEFAULT_CHANNEL_TYPES = ['stable', 'beta', 'dev'];
const GAPPED_CHANNEL_TYPES = ['stable', 'stable_soon', 'beta', 'dev'];
const SHOW_DATES = true;
const compareFeatures = (a, b) =>
  a.name.localeCompare(b.name, 'fr', {ignorePunctuation: true}); // comparator for sorting milestone features

@customElement('chromedash-roadmap')
export class ChromedashRoadmap extends LitElement {
  static get styles() {
    return [
      ...SHARED_STYLES,
      css`
        :host {
          display: inline-flex;
          padding: 0 0em var(--content-padding-huge);
          margin-right: var(--content-padding-negative);
          position: relative;
        }
      `,
    ];
  }
  @property({type: Boolean})
  signedIn;
  @property({type: Number, attribute: false})
  numColumns = 0;
  @property({type: Number, attribute: false})
  cardWidth = 0;
  @state()
  channels: Channels = {};
  @state()
  starredFeatures = new Set<number>();
  /**
   * The timestamp of the last fetched future milestone.
   */
  @state()
  lastFutureFetchedOn!: number;
  /**
   * The timestamp of the last fetched past milestone.
   */
  @state()
  lastPastFetchedOn!: number;
  /**
   * The milestone number currently visible on the screen to the user.
   */
  @state()
  lastMilestoneVisible!: number;
  /**
   * Array to store the milestone numbers fetched after the dev channel.
   */
  @state()
  futureMilestoneArray: number[] = [];
  /**
   * Array to store the milestone numbers fetched before the stable channel.
   */
  @state()
  pastMilestoneArray: number[] = [];
  /**
   * Object to store milestone details (features, version, etc.) fetched after the dev channel.
   */
  @state()
  milestoneInfo!: MilestoneInfo;
  /**
   * The feature to highlight.
   */
  @state()
  highlightFeature: number | undefined = undefined;
  /**
   * The left margin value.
   */
  @state()
  cardOffset = 0;
  @state()
  shownChannelNames: string[] = [];

  connectedCallback() {
    super.connectedCallback();

    Promise.all([window.csClient.getChannels(), window.csClient.getStars()])
      .then(([channels, starredFeatures]) => {
        this.fetchFirstBatch(channels);
        this.starredFeatures = new Set(starredFeatures);
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
      });
  }

  fetchFirstBatch(channels) {
    this.shownChannelNames = channels['stable_soon']
      ? GAPPED_CHANNEL_TYPES
      : DEFAULT_CHANNEL_TYPES;
    const promises = this.shownChannelNames.map(channelType =>
      window.csClient.getFeaturesInMilestone(channels[channelType].version)
    );
    Promise.all(promises).then(allRes => {
      allRes.map((res, idx) => {
        Object.keys(res).forEach(status => {
          res[status].sort(compareFeatures);
        });
        channels[this.shownChannelNames[idx]].features = res;
      });
      this.channels = channels;

      this.fetchNextBatch(channels['beta'].version, true);
      this.fetchPreviousBatch(channels['stable'].version);
      this.lastMilestoneVisible =
        channels[this.shownChannelNames[this.numColumns - 1]].version;
    });
  }

  fetchNextBatch(nextVersion, firstTime = false) {
    const fetchInAdvance = 3; // number of milestones to fetch while fetching for the first time
    const fetchStart = firstTime
      ? nextVersion + 2
      : nextVersion + fetchInAdvance + 1;
    const fetchEnd = nextVersion + fetchInAdvance + 1;
    const versions = [...Array(fetchEnd - fetchStart + 1).keys()].map(
      x => x + fetchStart
    );

    // Promises to get the info and features of specified milestone versions
    const milestonePromise = window.csClient.getSpecifiedChannels(
      fetchStart,
      fetchEnd
    );
    const featurePromises = versions.map(ver =>
      window.csClient.getFeaturesInMilestone(ver)
    );

    this.futureMilestoneArray = [...this.futureMilestoneArray, ...versions];
    this.lastFutureFetchedOn = nextVersion;

    // Fetch milestones object first
    milestonePromise
      .then(newMilestonesInfo => {
        // Then fetch features for each milestone
        Promise.all(featurePromises).then(allRes => {
          allRes.map((res, idx) => {
            Object.keys(res).forEach(status => {
              res[status].sort(compareFeatures);
            });
            // attach each milestone's feature response to the milestone object
            const version = versions[idx];
            newMilestonesInfo[version].features = res;
            newMilestonesInfo[version].version = version;

            // update the properties to render the latest milestone cards
            this.milestoneInfo = Object.assign(
              {},
              this.milestoneInfo,
              newMilestonesInfo
            );
          });
        });
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
      });
  }

  fetchPreviousBatch(version) {
    const versionToFetch = version - 1;
    // Chrome 1 is the first release. Hence, do not fetch if already fetched Chrome 1.
    if (versionToFetch < 2) return;

    // Promises to get the info and features of specified milestone versions
    const milestonePromise = window.csClient.getSpecifiedChannels(
      versionToFetch,
      versionToFetch
    );
    const featurePromise =
      window.csClient.getFeaturesInMilestone(versionToFetch);

    // add the newly fetched milestone to the starting of the list and shift the element horizontally
    const margin = 16;
    this.cardOffset -= 1;
    this.style.left = this.cardOffset * (this.cardWidth + margin) + 'px';

    this.pastMilestoneArray = [versionToFetch, ...this.pastMilestoneArray];
    this.lastPastFetchedOn = version;

    Promise.all([milestonePromise, featurePromise])
      .then(([newMilestonesInfo, features]) => {
        // sort the feature lists
        Object.keys(features).forEach(status => {
          features[status].sort(compareFeatures);
        });
        // attach the milestone's feature response to the milestone object
        newMilestonesInfo[versionToFetch].features = features;
        newMilestonesInfo[versionToFetch].version = versionToFetch;

        // update the properties to render the newly fetched milestones
        this.milestoneInfo = Object.assign(
          {},
          this.milestoneInfo,
          newMilestonesInfo
        );
      })
      .catch(() => {
        showToastMessage(
          'Some errors occurred. Please refresh the page or try again later.'
        );
      });
  }

  // Handles the Star-Toggle event fired by any one of the child components
  handleStarToggle(e) {
    const newStarredFeatures = new Set(this.starredFeatures);
    window.csClient
      .setStar(e.detail.feature, e.detail.doStar)
      .then(() => {
        if (e.detail.doStar) {
          newStarredFeatures.add(e.detail.feature);
        } else {
          newStarredFeatures.delete(e.detail.feature);
        }
        this.starredFeatures = newStarredFeatures;
      })
      .catch(() => {
        showToastMessage('Unable to star the Feature. Please Try Again.');
      });
  }

  handleHighlightEvent(e) {
    this.highlightFeature = e.detail.feature;
  }

  render() {
    // Note: We use repeat() rather than map() to prevent Lit from reusing
    // elements that fetch data exactly once via their connectedCallback().
    return html`
      ${repeat(
        this.pastMilestoneArray,
        milestone => milestone,
        milestone => html`
          <chromedash-roadmap-milestone-card
            style="width:${this.cardWidth}px;"
            .channel=${this.milestoneInfo?.[milestone]}
            .templateContent=${TEMPLATE_CONTENT['stable_minus_one']}
            ?showdates=${SHOW_DATES}
            .starredFeatures=${this.starredFeatures}
            .highlightFeature=${this.highlightFeature}
            ?signedin=${this.signedIn}
            @star-toggle-event=${this.handleStarToggle}
            @highlight-feature-event=${this.handleHighlightEvent}
          >
          </chromedash-roadmap-milestone-card>
        `
      )}
      ${repeat(
        this.shownChannelNames,
        channelType => channelType,
        channelType => html`
          <chromedash-roadmap-milestone-card
            style="width:${this.cardWidth}px;"
            .channel=${this.channels?.[channelType]}
            .templateContent=${TEMPLATE_CONTENT[channelType]}
            ?showdates=${SHOW_DATES}
            .starredFeatures=${this.starredFeatures}
            .highlightFeature=${this.highlightFeature}
            ?signedin=${this.signedIn}
            .stableMilestone=${this.channels?.['stable']?.version}
            @star-toggle-event=${this.handleStarToggle}
            @highlight-feature-event=${this.handleHighlightEvent}
          >
          </chromedash-roadmap-milestone-card>
        `
      )}
      ${repeat(
        this.futureMilestoneArray,
        milestone => milestone,
        milestone => html`
          <chromedash-roadmap-milestone-card
            style="width:${this.cardWidth}px;"
            .channel=${this.milestoneInfo?.[milestone]}
            .templateContent=${TEMPLATE_CONTENT['dev_plus_one']}
            ?showdates=${SHOW_DATES}
            .starredFeatures=${this.starredFeatures}
            .highlightFeature=${this.highlightFeature}
            ?signedin=${this.signedIn}
            @star-toggle-event=${this.handleStarToggle}
            @highlight-feature-event=${this.handleHighlightEvent}
          >
          </chromedash-roadmap-milestone-card>
        `
      )}
    `;
  }
}
