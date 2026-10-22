import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
@Injectable()
export class PasswordService {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  } as const;
  private readonly dummyHash = this.hash(randomBytes(32).toString('hex'));
  hash(password: string) {
    return argon2.hash(password, this.options);
  }
  async verify(password: string, hash?: string) {
    return argon2.verify(hash ?? (await this.dummyHash), password);
  }
}
