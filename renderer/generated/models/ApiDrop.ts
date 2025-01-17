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

import { ApiDropContextProfileContext } from '../models/ApiDropContextProfileContext';
import { ApiDropMentionedUser } from '../models/ApiDropMentionedUser';
import { ApiDropMetadata } from '../models/ApiDropMetadata';
import { ApiDropPart } from '../models/ApiDropPart';
import { ApiDropRater } from '../models/ApiDropRater';
import { ApiDropReferencedNFT } from '../models/ApiDropReferencedNFT';
import { ApiDropSubscriptionTargetAction } from '../models/ApiDropSubscriptionTargetAction';
import { ApiDropType } from '../models/ApiDropType';
import { ApiProfileMin } from '../models/ApiProfileMin';
import { ApiReplyToDropResponse } from '../models/ApiReplyToDropResponse';
import { ApiWaveMin } from '../models/ApiWaveMin';
import { HttpFile } from '../http/http';

export class ApiDrop {
    'id': string;
    /**
    * Sequence number of the drop in Seize
    */
    'serial_no': number;
    'drop_type': ApiDropType;
    'rank': number | null;
    'wave': ApiWaveMin;
    'reply_to'?: ApiReplyToDropResponse;
    'author': ApiProfileMin;
    /**
    * Time when the drop was created in milliseconds since 1-1-1970 00:00:00.0 UTC
    */
    'created_at': number;
    /**
    * Time when the drop was updated in milliseconds since 1-1-1970 00:00:00.0 UTC
    */
    'updated_at': number | null;
    'title': string | null;
    'parts': Array<ApiDropPart>;
    /**
    * Number of drops in the storm
    */
    'parts_count': number;
    'referenced_nfts': Array<ApiDropReferencedNFT>;
    'mentioned_users': Array<ApiDropMentionedUser>;
    'metadata': Array<ApiDropMetadata>;
    'rating': number;
    'top_raters': Array<ApiDropRater>;
    'raters_count': number;
    'context_profile_context': ApiDropContextProfileContext | null;
    'subscribed_actions': Array<ApiDropSubscriptionTargetAction>;

    static readonly discriminator: string | undefined = undefined;

    static readonly attributeTypeMap: Array<{name: string, baseName: string, type: string, format: string}> = [
        {
            "name": "id",
            "baseName": "id",
            "type": "string",
            "format": ""
        },
        {
            "name": "serial_no",
            "baseName": "serial_no",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "drop_type",
            "baseName": "drop_type",
            "type": "ApiDropType",
            "format": ""
        },
        {
            "name": "rank",
            "baseName": "rank",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "wave",
            "baseName": "wave",
            "type": "ApiWaveMin",
            "format": ""
        },
        {
            "name": "reply_to",
            "baseName": "reply_to",
            "type": "ApiReplyToDropResponse",
            "format": ""
        },
        {
            "name": "author",
            "baseName": "author",
            "type": "ApiProfileMin",
            "format": ""
        },
        {
            "name": "created_at",
            "baseName": "created_at",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "updated_at",
            "baseName": "updated_at",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "title",
            "baseName": "title",
            "type": "string",
            "format": ""
        },
        {
            "name": "parts",
            "baseName": "parts",
            "type": "Array<ApiDropPart>",
            "format": ""
        },
        {
            "name": "parts_count",
            "baseName": "parts_count",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "referenced_nfts",
            "baseName": "referenced_nfts",
            "type": "Array<ApiDropReferencedNFT>",
            "format": ""
        },
        {
            "name": "mentioned_users",
            "baseName": "mentioned_users",
            "type": "Array<ApiDropMentionedUser>",
            "format": ""
        },
        {
            "name": "metadata",
            "baseName": "metadata",
            "type": "Array<ApiDropMetadata>",
            "format": ""
        },
        {
            "name": "rating",
            "baseName": "rating",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "top_raters",
            "baseName": "top_raters",
            "type": "Array<ApiDropRater>",
            "format": ""
        },
        {
            "name": "raters_count",
            "baseName": "raters_count",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "context_profile_context",
            "baseName": "context_profile_context",
            "type": "ApiDropContextProfileContext",
            "format": ""
        },
        {
            "name": "subscribed_actions",
            "baseName": "subscribed_actions",
            "type": "Array<ApiDropSubscriptionTargetAction>",
            "format": ""
        }    ];

    static getAttributeTypeMap() {
        return ApiDrop.attributeTypeMap;
    }

    public constructor() {
    }
}



