import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { toDisplayText } from './display-text.ts'
import { StepDetail } from './step-detail.tsx'
import type { SnapshotReply } from './use-snapshot-polling.ts'

type Snapshot = Extract<SnapshotReply, { kind: 'snapshot' }>['snapshot']
type SnapshotError = Snapshot['errors'][number]

const errorLine = ({ file, location, field, message }: SnapshotError): string =>
  toDisplayText(
    [file, location === null ? null : String(location), field, message].filter((part) => part !== null).join(' · '),
  )

type PlanRailProps = { snapshot: Snapshot; textColor: string; errorColor: string; accentColor: string }

export const PlanRail = ({ snapshot, textColor, errorColor, accentColor }: PlanRailProps) => {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  return (
    <View>
      {snapshot.issue === null ? null : <Text style={{ color: textColor }}>{toDisplayText(snapshot.issue)}</Text>}
      {snapshot.title === null ? null : <Text style={{ color: textColor }}>{toDisplayText(snapshot.title)}</Text>}
      {snapshot.steps.length === 0 ? <Text style={{ color: textColor }}>No steps yet.</Text> : null}
      {snapshot.steps.map((step) => (
        <View key={step.id}>
          <Pressable onPress={() => setSelectedStepId(step.id)}>
            <Text style={{ color: textColor }}>{`${toDisplayText(step.title)} (${toDisplayText(step.status)})`}</Text>
            {step.timeSpent === null ? null : (
              <Text style={{ color: textColor }}>{toDisplayText(step.timeSpent.label)}</Text>
            )}
            {step.id === snapshot.currentStepId ? <Text style={{ color: accentColor }}>Current</Text> : null}
            {step.id === snapshot.currentStepId && snapshot.currentAgent !== null ? (
              <>
                <Text style={{ color: textColor }}>{`Agent: ${toDisplayText(snapshot.currentAgent.role)}`}</Text>
                <Text style={{ color: textColor }}>{snapshot.currentAgent.state}</Text>
              </>
            ) : null}
          </Pressable>
          {step.id === selectedStepId ? <StepDetail decisions={step.decisions} textColor={textColor} /> : null}
        </View>
      ))}
      {snapshot.errors.length === 0 ? null : <Text style={{ color: errorColor }}>Snapshot errors</Text>}
      {snapshot.errors.map((error, index) => (
        <Text key={index} style={{ color: errorColor }}>
          {errorLine(error)}
        </Text>
      ))}
    </View>
  )
}
