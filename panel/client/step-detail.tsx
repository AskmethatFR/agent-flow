import { Text, View } from 'react-native'
import { toDisplayText } from './display-text.ts'
import type { SnapshotReply } from './use-snapshot-polling.ts'

type Snapshot = Extract<SnapshotReply, { kind: 'snapshot' }>['snapshot']
type Decision = Snapshot['steps'][number]['decisions'][number]

type StepDetailProps = { decisions: readonly Decision[]; omittedDecisions: number; textColor: string }

export const StepDetail = ({ decisions, omittedDecisions, textColor }: StepDetailProps) => (
  <View>
    {decisions.length === 0 ? <Text style={{ color: textColor }}>No decision logged for this step.</Text> : null}
    {decisions.map(({ title, why, rejected, role, confidence }, index) => (
      <View key={index}>
        <Text style={{ color: textColor }}>{toDisplayText(title)}</Text>
        <Text style={{ color: textColor }}>{`Why: ${toDisplayText(why)}`}</Text>
        {rejected.length === 0 ? null : (
          <Text style={{ color: textColor }}>{`Rejected: ${toDisplayText(rejected.join(' · '))}`}</Text>
        )}
        <Text style={{ color: textColor }}>{`Role: ${toDisplayText(role)} · Confidence: ${confidence}`}</Text>
      </View>
    ))}
    {omittedDecisions === 0 ? null : <Text style={{ color: textColor }}>{`Decisions not shown: ${omittedDecisions}`}</Text>}
  </View>
)
