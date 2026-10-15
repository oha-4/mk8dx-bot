/**
 * コマンドの利用範囲。global はすべてのギルド、admin は管理用ギルド（開発時は開発用ギルド）だけで使える。
 */
export type CommandScope = 'global' | 'admin'
