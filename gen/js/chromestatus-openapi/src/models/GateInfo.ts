/* tslint:disable */
/* eslint-disable */
/**
 * chomestatus API
 * The API for chromestatus.com. chromestatus.com is the official tool used for tracking feature launches in Blink (the browser engine that powers Chrome and many other web browsers). This tool guides feature owners through our launch process and serves as a primary source for developer information that then ripples throughout the web developer ecosystem. More details at: https://github.com/GoogleChrome/chromium-dashboard
 *
 * The version of the OpenAPI document: 1.0.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { mapValues } from '../runtime';
/**
 * 
 * @export
 * @interface GateInfo
 */
export interface GateInfo {
    /**
     * 
     * @type {string}
     * @memberof GateInfo
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof GateInfo
     */
    description?: string;
    /**
     * 
     * @type {number}
     * @memberof GateInfo
     */
    gate_type?: number;
    /**
     * 
     * @type {string}
     * @memberof GateInfo
     */
    rule?: string;
    /**
     * A list of approvers. A single string can also be accepted and will be treated as a list containing that string.
     * @type {string}
     * @memberof GateInfo
     */
    approvers?: string;
    /**
     * 
     * @type {string}
     * @memberof GateInfo
     */
    team_name?: string;
    /**
     * 
     * @type {string}
     * @memberof GateInfo
     */
    escalation_email?: string;
    /**
     * DEFAULT_SLO_LIMIT is 5 in approval_defs.py
     * @type {number}
     * @memberof GateInfo
     */
    slo_initial_response?: number;
    /**
     * DEFAULT_SLO_RESOLVE_LIMIT is 10 in approval_defs.py
     * @type {number}
     * @memberof GateInfo
     */
    slo_resolve?: number;
}

/**
 * Check if a given object implements the GateInfo interface.
 */
export function instanceOfGateInfo(value: object): value is GateInfo {
    return true;
}

export function GateInfoFromJSON(json: any): GateInfo {
    return GateInfoFromJSONTyped(json, false);
}

export function GateInfoFromJSONTyped(json: any, ignoreDiscriminator: boolean): GateInfo {
    if (json == null) {
        return json;
    }
    return {
        
        'name': json['name'] == null ? undefined : json['name'],
        'description': json['description'] == null ? undefined : json['description'],
        'gate_type': json['gate_type'] == null ? undefined : json['gate_type'],
        'rule': json['rule'] == null ? undefined : json['rule'],
        'approvers': json['approvers'] == null ? undefined : json['approvers'],
        'team_name': json['team_name'] == null ? undefined : json['team_name'],
        'escalation_email': json['escalation_email'] == null ? undefined : json['escalation_email'],
        'slo_initial_response': json['slo_initial_response'] == null ? undefined : json['slo_initial_response'],
        'slo_resolve': json['slo_resolve'] == null ? undefined : json['slo_resolve'],
    };
}

export function GateInfoToJSON(value?: GateInfo | null): any {
    if (value == null) {
        return value;
    }
    return {
        
        'name': value['name'],
        'description': value['description'],
        'gate_type': value['gate_type'],
        'rule': value['rule'],
        'approvers': value['approvers'],
        'team_name': value['team_name'],
        'escalation_email': value['escalation_email'],
        'slo_initial_response': value['slo_initial_response'],
        'slo_resolve': value['slo_resolve'],
    };
}

