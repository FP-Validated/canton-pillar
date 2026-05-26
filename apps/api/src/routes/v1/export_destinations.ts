export const exportDestinationScopes = ['export_destinations:write'] as const;
export function disableDestination(destination: { disabled?: boolean }) { return { ...destination, disabled: true }; }
