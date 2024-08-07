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

import { DropSubscriptionTargetAction } from '../models/DropSubscriptionTargetAction';
import { HttpFile } from '../http/http';

export class DropSubscriptionActions {
    'actions': Array<DropSubscriptionTargetAction>;

    static readonly discriminator: string | undefined = undefined;

    static readonly attributeTypeMap: Array<{name: string, baseName: string, type: string, format: string}> = [
        {
            "name": "actions",
            "baseName": "actions",
            "type": "Array<DropSubscriptionTargetAction>",
            "format": ""
        }    ];

    static getAttributeTypeMap() {
        return DropSubscriptionActions.attributeTypeMap;
    }

    public constructor() {
    }
}

