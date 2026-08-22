import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Model, Types } from 'mongoose'
import { InjectModel } from '@nestjs/mongoose';
import APIKey from 'src/models/concrete/api-key';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ApiKeysService {
    private readonly privateKey: string | undefined;

    constructor(
        @InjectModel(APIKey.name) private readonly apiKeyModel: Model<APIKey>
    ) {
        try {
            const keyPath = path.join(process.cwd(), 'keys', 'private.pem');
            this.privateKey = fs.readFileSync(keyPath, 'utf8');
        } catch (error) {
            console.error('Failed to load private key', error);
        }
    }

    async generateCustomApiKey(userId: string, title: string, allowedDomain: string) {
        const KeyId = new Types.ObjectId();

        const payload = `${userId}|${allowedDomain}|${KeyId.toString()}`;
        const encodedPayload = Buffer.from(payload).toString('base64url');

        const sign = crypto.createSign('SHA256');
        sign.update(payload);
        sign.end();

        const signature = sign.sign(this.privateKey!, 'base64url');
        const finalApiKey = `${encodedPayload}.${signature}`;

        await this.apiKeyModel.create({
            _id: KeyId,
            userId: new Types.ObjectId(userId),
            title,
            allowedDomain
        });

        return {
            apiKey: finalApiKey,
            keyId: KeyId
        };
    }
}
