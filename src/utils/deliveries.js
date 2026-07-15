export function calculateDeliveredPieces({ unit, quantity, caseCount, piecesPerCase }) {
  return unit === 'case'
    ? Number(caseCount) * Number(piecesPerCase)
    : Number(quantity)
}

export function calculateStockDistribution({
  deliveredPieces,
  inputUnit,
  piecesPerCase,
  shelf,
  warehouse,
  returned,
  damaged,
}) {
  const multiplier = inputUnit === 'case' ? Number(piecesPerCase) : 1
  const distribution = {
    shelf: Number(shelf) * multiplier,
    warehouse: Number(warehouse) * multiplier,
    returned: Number(returned) * multiplier,
    damaged: Number(damaged) * multiplier,
  }
  const allocated = Object.values(distribution).reduce((total, quantity) => total + quantity, 0)
  return {
    ...distribution,
    difference: Number(deliveredPieces) - allocated,
  }
}
