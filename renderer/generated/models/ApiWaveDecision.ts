/**
 * Seize API
 * This is the API interface description for the most commonly used operations in Seize API.  Some modifying endpoints require an authentication token.   We are in the process of documenting all Seize APIs.   If there is an API that you need, please ping us in Discord and we will aim to prioritize its documentation.
 *
 * OpenAPI spec version: 1.0.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { ApiWaveDecisionWinner } from '../models/ApiWaveDecisionWinner';
import { HttpFile } from '../http/http';

export class ApiWaveDecision {
    'decision_time': number;
    'winners': Array<ApiWaveDecisionWinner>;

    static readonly discriminator: string | undefined = undefined;

    static readonly attributeTypeMap: Array<{name: string, baseName: string, type: string, format: string}> = [
        {
            "name": "decision_time",
            "baseName": "decision_time",
            "type": "number",
            "format": "int62"
        },
        {
            "name": "winners",
            "baseName": "winners",
            "type": "Array<ApiWaveDecisionWinner>",
            "format": ""
        }    ];

    static getAttributeTypeMap() {
        return ApiWaveDecision.attributeTypeMap;
    }

    public constructor() {
    }
}

