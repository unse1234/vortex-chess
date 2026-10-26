import { Injectable } from '@nestjs/common';
import type { ChannelAuthorizer } from './realtime.contracts';

/** Features register how their channels are authorized; realtime stays domain-free. */
@Injectable()
export class RealtimeChannels {
  private readonly authorizers = new Map<string, ChannelAuthorizer>();

  register(prefix: string, authorizer: ChannelAuthorizer) {
    this.authorizers.set(prefix, authorizer);
  }

  resolve(channel: string) {
    const match = /^([a-z]+):([0-9a-f-]{36})$/.exec(channel);
    if (!match) return null;
    const authorizer = this.authorizers.get(match[1]);
    return authorizer ? { authorizer, resourceId: match[2] } : null;
  }
}
