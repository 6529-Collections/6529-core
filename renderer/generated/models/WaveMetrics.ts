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

import { HttpFile } from '../http/http';

export class WaveMetrics {
    'subscribers_count': number;
    'drops_count': number;
    'latest_drop_timestamp': number;
    'your_drops_count'?: number;
    'your_latest_drop_timestamp'?: number;

    static readonly discriminator: string | undefined = undefined;

    static readonly attributeTypeMap: Array<{name: string, baseName: string, type: string, format: string}> = [
        {
            "name": "subscribers_count",
            "baseName": "subscribers_count",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "drops_count",
            "baseName": "drops_count",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "latest_drop_timestamp",
            "baseName": "latest_drop_timestamp",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "your_drops_count",
            "baseName": "your_drops_count",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "your_latest_drop_timestamp",
            "baseName": "your_latest_drop_timestamp",
            "type": "number",
            "format": "int64"
        }    ];

    static getAttributeTypeMap() {
        return WaveMetrics.attributeTypeMap;
    }

    public constructor() {
    }
}

