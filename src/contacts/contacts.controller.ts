import { Controller } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller('contacts')
export class ContactsController {
    constructor(private readonly contactService: ContactsService) { }

    @MessagePattern('contact.add')
    async usersDetails(@Payload() data: {
        query: string,
        customFirstName: string,
        customLastName: string,
    }, @RPCContext() context) {

        return await this.contactService.addContact(
            data.query,
            data.customFirstName,
            data.customLastName,
            context
        );
    }
}
