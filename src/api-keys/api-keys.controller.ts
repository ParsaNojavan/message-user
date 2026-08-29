import { Controller } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('')
export class ApiKeysController {
    constructor(private readonly apiKeysService: ApiKeysService) { }

    @MessagePattern('api_key.create')
    async createApiKey(@Payload() payload: { userId: string, title: string, allowedDomain: string }) {
        return this.apiKeysService.generateCustomApiKey(
            payload.userId,
            payload.title,
            payload.allowedDomain,
        );
    }
}
