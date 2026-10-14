import { Routes, type REST, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js'

type Target = {
    applicationId: string
    /** 指定するとそのギルドにだけ登録する。未指定ならグローバルに登録する */
    devGuildId: string | undefined
}

/**
 * コードに定義されたスラッシュコマンドで、登録先のコマンドを一括で置き換える（コードから消えたものは消える）。
 */
export const registerSlashCommands = async (
    rest: Pick<REST, 'put'>,
    { applicationId, devGuildId }: Target,
    body: RESTPostAPIChatInputApplicationCommandsJSONBody[],
) => {
    const route =
        devGuildId === undefined
            ? Routes.applicationCommands(applicationId)
            : Routes.applicationGuildCommands(applicationId, devGuildId)
    await rest.put(route, { body })
    return { scope: devGuildId === undefined ? 'global' : 'guild', count: body.length } as const
}
