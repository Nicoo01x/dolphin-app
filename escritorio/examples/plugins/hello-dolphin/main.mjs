// Sample plugin runs in a lazily forked plain-Node worker; its default export receives commands, events and capability-gated host API.
export default function activate(dolphin) {
  dolphin.commands.register('hello-ping', async () => {
    const stored = await dolphin.host.call('storage.get', { key: 'pings' })
    const count = (typeof stored?.value === 'number' ? stored.value : 0) + 1
    await dolphin.host.call('storage.set', { key: 'pings', value: count })
    // A string result is shown as-is in Dolphin; objects are shown as JSON.
    return count === 1 ? 'Pong! First ping.' : `Pong! ${count} pings so far.`
  })

  dolphin.events.on('workspace.created', async (payload) => {
    dolphin.log(`${payload.kind} created: ${payload.workspaceId} at ${payload.path}`)
    await dolphin.host.call('notifications.show', {
      title: 'Workspace created',
      body: payload.path
    })
  })

  dolphin.events.on('agent.status.changed', (payload) => {
    dolphin.log(`agent status: ${payload.state} in ${payload.workspaceId ?? 'unknown workspace'}`)
  })
}
