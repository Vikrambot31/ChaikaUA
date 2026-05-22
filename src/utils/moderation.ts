export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export const createPendingModeration = () => ({
  moderationStatus: 'pending' as ModerationStatus,
  submittedForModerationAt: new Date().toISOString(),
});

export const isApprovedByModeration = (item: { moderationStatus?: ModerationStatus; status?: ModerationStatus }) =>
  (item.moderationStatus ?? item.status) === 'approved';

export const getModerationLabel = (
  status: ModerationStatus | undefined,
  labels: { pending: string; approved: string; rejected: string }
) => {
  if (status === 'approved') return labels.approved;
  if (status === 'rejected') return labels.rejected;
  return labels.pending;
};
