import { Text, View } from 'react-native'
import { toDisplayText } from './display-text.ts'
import type { SnapshotReply } from './use-snapshot-polling.ts'

type Snapshot = Extract<SnapshotReply, { kind: 'snapshot' }>['snapshot']
type SnapshotError = Snapshot['errors'][number]

const errorLine = ({ file, location, field, message }: SnapshotError): string =>
  toDisplayText(
    [file, location === null ? null : String(location), field, message].filter((part) => part !== null).join(' · '),
  )

export const PlanRail = ({ snapshot, errorColor }: { snapshot: Snapshot; errorColor: string }) => (
  <View>
    {snapshot.issue === null ? null : <Text>{toDisplayText(snapshot.issue)}</Text>}
    {snapshot.title === null ? null : <Text>{toDisplayText(snapshot.title)}</Text>}
    {snapshot.steps.length === 0 ? <Text>No steps yet.</Text> : null}
    {snapshot.steps.map((step) => (
      <Text key={step.id}>{toDisplayText(`${step.title} (${step.status})`)}</Text>
    ))}
    {snapshot.errors.length === 0 ? null : <Text style={{ color: errorColor }}>Snapshot errors</Text>}
    {snapshot.errors.map((error, index) => (
      <Text key={index} style={{ color: errorColor }}>
        {errorLine(error)}
      </Text>
    ))}
  </View>
)
