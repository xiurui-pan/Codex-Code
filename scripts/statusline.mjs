#!/usr/bin/env node

import { stdin, stdout, stderr, exit } from 'node:process'

function formatCurrency(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0.00'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value)
}

function formatHourlyRate(totalCostUsd, totalDurationMs) {
  if (!Number.isFinite(totalCostUsd) || totalCostUsd <= 0) {
    return '$0.00/hr'
  }
  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) {
    return '$0.00/hr'
  }
  const perHour = totalCostUsd / (totalDurationMs / 3_600_000)
  return `${formatCurrency(perHour)}/hr`
}

function formatModel(input) {
  return input.model?.display_name || input.model?.id || 'GPT'
}

function buildStatusLine(input) {
  if (input.cost?.billing_available === false) {
    return `🤖 ${formatModel(input)}`
  }

  const totalCost = input.cost?.total_cost_usd ?? 0
  const todayCost = input.cost?.today_cost_usd
  const totalDurationMs = input.cost?.total_duration_ms ?? 0

  const hourlyRate = formatHourlyRate(totalCost, totalDurationMs)
  const modelLabel = formatModel(input)
  const billingParts = [`${formatCurrency(totalCost)} session`]

  if (Number.isFinite(todayCost) && todayCost > 0) {
    billingParts.push(`${formatCurrency(todayCost)} today`)
  }
  billingParts.push(hourlyRate)

  return `🤖 ${modelLabel} | 💰 ${billingParts.join(' / ')}`
}

let raw = ''
stdin.setEncoding('utf8')
stdin.on('data', chunk => {
  raw += chunk
})
stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {}
    stdout.write(buildStatusLine(input))
  } catch (error) {
    stderr.write(`statusline parse error: ${error instanceof Error ? error.message : String(error)}\n`)
    exit(1)
  }
})
stdin.resume()
