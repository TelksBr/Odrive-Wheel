const ODRIVE_ERROR_REPLY = /^(not implemented|invalid property|error|err_)/i;

export function isOdriveErrorReply(reply: string): boolean {
  return ODRIVE_ERROR_REPLY.test(reply.trim());
}
