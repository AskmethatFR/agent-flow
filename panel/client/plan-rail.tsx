import { Text, View } from 'react-native'
import type { SnapshotReply } from './use-snapshot-polling.ts'

type Snapshot = Extract<SnapshotReply, { kind: 'snapshot' }>['snapshot']

export const PlanRail = ({ snapshot }: { snapshot: Snapshot }) => (
  <View>
    {snapshot.issue === null ? null : <Text>{snapshot.issue}</Text>}
    {snapshot.title === null ? null : <Text>{snapshot.title}</Text>}
    {snapshot.steps.map((step) => (
      <Text key={step.id}>{`${step.title} (${step.status})`}</Text>
    ))}
  </View>
)
