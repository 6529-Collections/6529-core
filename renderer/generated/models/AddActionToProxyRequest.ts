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

import { ApiCreateNewProfileProxyAllocateCicAction } from '../models/ApiCreateNewProfileProxyAllocateCicAction';
import { ApiCreateNewProfileProxyAllocateRepAction } from '../models/ApiCreateNewProfileProxyAllocateRepAction';
import { ApiCreateNewProfileProxyCreateWaveAction } from '../models/ApiCreateNewProfileProxyCreateWaveAction';
import { ApiCreateNewProfileProxyCreateWaveParticipationDropAction } from '../models/ApiCreateNewProfileProxyCreateWaveParticipationDropAction';
import { ApiCreateNewProfileProxyReadWaveAction } from '../models/ApiCreateNewProfileProxyReadWaveAction';
import { ApiProfileProxyActionType } from '../models/ApiProfileProxyActionType';
import { HttpFile } from '../http/http';

export class AddActionToProxyRequest {
    'action_type': ApiProfileProxyActionType;
    'end_time': number | null;
    'credit_amount': number;

    static readonly discriminator: string | undefined = undefined;

    static readonly attributeTypeMap: Array<{name: string, baseName: string, type: string, format: string}> = [
        {
            "name": "action_type",
            "baseName": "action_type",
            "type": "ApiProfileProxyActionType",
            "format": ""
        },
        {
            "name": "end_time",
            "baseName": "end_time",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "credit_amount",
            "baseName": "credit_amount",
            "type": "number",
            "format": "int64"
        }    ];

    static getAttributeTypeMap() {
        return AddActionToProxyRequest.attributeTypeMap;
    }

    public constructor() {
    }
}



