import { pino, stdSerializers, type DestinationStream, type Logger } from 'pino'

export type { Logger }

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'

/**
 * 標準出力に JSON で出力するロガーを作る。テストでは destination を差し替える。
 */
export const createLogger = (level: LogLevel, destination?: DestinationStream): Logger =>
    pino(
        {
            level,
            base: null,
            // err 以外のキーに入れた Error も中身が残るようにする
            serializers: { err: stdSerializers.err, original: stdSerializers.err },
            redact: { paths: ['token', '*.token', 'discordToken', '*.discordToken'], censor: '[redacted]' },
        },
        destination,
    )
