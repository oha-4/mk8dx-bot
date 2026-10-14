/**
 * 利用者に伝えるべき想定内のエラー。message はそのまま利用者に表示され、エラーログチャンネルには通知しない。
 */
export class UserFacingError extends Error {
    override readonly name = 'UserFacingError'
}
