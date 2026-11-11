import { Text, View } from 'react-native'
import { toDisplayText } from './display-text.ts'
import type { SnapshotReply } from './use-snapshot-polling.ts'

type Snapshot = Extract<SnapshotReply, { kind: 'snapshot' }>['snapshot']
type Decision = Snapshot['steps'][number]['decisions'][number]

type Fact = Snapshot['steps'][number]['facts'][number]

const BADGE: Record<Fact['origin'], string> = { verified: 'Verified', declared: 'Declared' }

type StepDetailProps = {
  decisions: readonly Decision[]
  omittedDecisions: number
  facts: readonly Fact[]
  textColor: string
}

export const StepDetail = ({ decisions, omittedDecisions, facts, textColor }: StepDetailProps) => (
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
    {facts.map(({ origin, source, label }, index) => (
      <View key={index}>
        <Text style={{ color: textColor }}>{BADGE[origin]}</Text>
        <Text style={{ color: textColor }}>{toDisplayText(label)}</Text>
        <Text style={{ color: textColor }}>{`Source: ${toDisplayText(source)}`}</Text>
      </View>
    ))}
  </View>
)
