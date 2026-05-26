export function Wizard({ nextAction }: { nextAction: { label: string; step: string } }) { return <div><h2>{nextAction.label}</h2><p>Step: {nextAction.step}</p></div>; }
