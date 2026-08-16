import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service'
import { MessagePattern, Payload } from '@nestjs/microservices';
import UserLoginRegisterDto from 'lib/contracts/src/models/dtos/user/user-login-register.dto';
import ResultDto from 'lib/contracts/src/models/dtos/resultDto';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';
import { UpdateUserDto } from '@app/contracts/models/dtos/user/user-update.dto';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) { }

  @MessagePattern('user.login')
  async login(@Payload() data: { userDto: UserLoginRegisterDto }): Promise<ResultDto> {
    return await this.userService.login(data.userDto)
  }

  @MessagePattern('user.register')
  async register(@Payload() data: { userDto: UserLoginRegisterDto }): Promise<ResultDto> {
    return await this.userService.register(data.userDto)
  }

  @MessagePattern('user.verify-code')
  async verifyCode(@Payload() data: { userDto: UserLoginRegisterDto }) {
    return await this.userService.verifyCode(data.userDto)
  }

  @MessagePattern('user.refresh-token')
  async refreshToken(@Payload() data: { refreshToken, lang?}) {
    return await this.userService.refreshToken(data);
  }

  @MessagePattern('user.reset-password')
  async resetPassword(@Payload() data: { resetPassword }, @RPCContext() context) {
    return await this.userService.resetPassword(data.resetPassword, context)
  }

  @MessagePattern('user.profile')
  async userProfile(@RPCContext() context) {
    return await this.userService.userProfile(context)
  }

  @MessagePattern('user.update')
  async updateProfile(@Payload() data: { userDto: UpdateUserDto }, @RPCContext() context) {
    return await this.userService.updateProfile(data.userDto, context)
  }

  @MessagePattern('user.block')
  async blockUsers(@Payload() data: { blockedId: string }, @RPCContext() context) {
    return await this.userService.blockUsers(data.userIds, context);
  }

}
