import { Routes, type REST, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js'

type Body = RESTPostAPIChatInputApplicationCommandsJSONBody[]

type Target = {
    applicationId: string
    /** 指定するとすべてのコマンドをこのギルドにだけ登録する */
    devGuildId: string | undefined
    /** 管理用のコマンドを登録するギルド */
    adminGuildId: string | undefined
}

export type RegistrationResult = {
    registered: { target: 'dev-guild' | 'global' | 'admin-guild'; count: number }[]
    /** 管理用ギルドが未設定で、登録できなかった管理用コマンドの数 */
    unregisteredAdminCount: number
}

/**
 * 登録先ごとに、コードに定義されたスラッシュコマンドで一括して置き換える（コードから消えたものは消える）。
 */
export const registerSlashCommands = async (
    rest: Pick<REST, 'put'>,
    { applicationId, devGuildId, adminGuildId }: Target,
    commands: { global: Body; admin: Body },
): Promise<RegistrationResult> => {
    if (devGuildId !== undefined) {
        const body = [...commands.global, ...commands.admin]
        await rest.put(Routes.applicationGuildCommands(applicationId, devGuildId), { body })
        return { registered: [{ target: 'dev-guild', count: body.length }], unregisteredAdminCount: 0 }
    }

    await rest.put(Routes.applicationCommands(applicationId), { body: commands.global })
    const registered: RegistrationResult['registered'] = [{ target: 'global', count: commands.global.length }]
    if (adminGuildId === undefined) {
        return { registered, unregisteredAdminCount: commands.admin.length }
    }
    await rest.put(Routes.applicationGuildCommands(applicationId, adminGuildId), { body: commands.admin })
    registered.push({ target: 'admin-guild', count: commands.admin.length })
    return { registered, unregisteredAdminCount: 0 }
}
