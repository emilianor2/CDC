export function demoState(users) {
  const cafes = [
    { id: 'cafe-norte', name: 'Café Norte', owner: 'Dueño demo', reward: 'Café gratis' },
    { id: 'cafe-sur', name: 'Café Sur', owner: 'Sin dueño aprobado', reward: 'Medialuna' },
  ].map(({ reward, ...place }) => ({
    ...place, city: 'Mendoza', sector: 'cafe', active: true, totalStamps: 5,
    milestones: [{ id: 'premio-' + place.id, at: 5, label: reward }],
  }));
  const clients = [
    { id: 'cliente-norte', name: 'Cliente demo', email: users.cliente.email, accountId: users.cliente.id, cafe: 'cafe-norte', stamps: 2 },
    { id: 'otro-norte', name: 'Otro cliente de Norte', email: 'otro@demo.clubdefans.test', cafe: 'cafe-norte', stamps: 1 },
    { id: 'cliente-sur', name: 'Cliente de Sur', email: 'sur@demo.clubdefans.test', cafe: 'cafe-sur', stamps: 1 },
  ].map(client => {
    const place = cafes.find(place => place.id === client.cafe);
    return {
      ...client, consent: true, consentAt: '2026-11-27T12:00:00Z',
      tokenHash: '', rewards: 0, visitTotal: client.stamps, cycle: 1,
      claimedRewardIds: [], rewardHistory: [],
      cardProgram: { total: place.totalStamps, milestones: structuredClone(place.milestones) },
    };
  });
  const ownerRequests = [{
    id: 'dueno-demo', userId: users.dueno.id, email: users.dueno.email, name: 'Dueño demo',
    businessName: 'Café Norte', city: 'Mendoza', sector: 'cafe', status: 'approved',
    tenantId: 'cafe-norte', assignedTenantId: 'cafe-norte', createdAt: '2026-11-27T12:00:00Z',
  }];
  return { cafes, clients, ownerRequests, admins: [users.superadmin.id], events: [], campaigns: [], operations: [], limits: {} };
}
