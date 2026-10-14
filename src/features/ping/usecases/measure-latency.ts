export type LatencyDeps = {
    /** Discord Gateway の往復遅延（ミリ秒）。未計測なら負の値 */
    gatewayPing: () => number
}

export type LatencyResult = { measured: true; milliseconds: number } | { measured: false }

export const measureLatency = ({ gatewayPing }: LatencyDeps): LatencyResult => {
    const ping = gatewayPing()
    return ping < 0 ? { measured: false } : { measured: true, milliseconds: Math.round(ping) }
}
