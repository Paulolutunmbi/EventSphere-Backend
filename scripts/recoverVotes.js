import 'dotenv/config'
import fs from 'fs/promises'
import connectDB from '../config/db.js'
import Award from '../model/award.model.js'
import Contestant from '../model/contestant.model.js'
import Vote from '../model/vote.model.js'

const DEFAULT_VOTE_UNIT = 5000

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeVoterName(name, email) {
  const trimmed = String(name || '').trim()
  if (trimmed) return trimmed

  const localPart = String(email || '').split('@')[0] || ''
  const cleaned = localPart.replace(/[._+-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function extractTransactionData(transaction) {
  if (transaction?.data) return transaction.data
  return transaction
}

async function resolveContestant({ eventId, awardId, metadata }) {
  if (metadata.contestant_id) {
    const contestant = await Contestant.findOne({ _id: metadata.contestant_id, eventId, awardId, isActive: true })
    if (contestant) return contestant
  }

  const slug = slugify(metadata.contestant_slug || metadata.nominee || '')
  if (!slug) return null

  return Contestant.findOne({ eventId, awardId, slug, isActive: true })
}

export async function recoverVotesFromTransactions(transactions = []) {
  const results = { inserted: 0, skipped: 0, errors: 0 }

  for (const transaction of transactions) {
    try {
      const data = extractTransactionData(transaction)
      if (!data) {
        results.skipped += 1
        continue
      }

      if (String(data.status || '').toLowerCase() !== 'success') {
        results.skipped += 1
        continue
      }

      const metadata = data.metadata || {}
      const reference = String(data.reference || '').trim()
      const eventId = String(metadata.event_id || '').trim()
      const awardId = String(metadata.award_id || '').trim()

      if (!reference || !eventId || !awardId) {
        results.skipped += 1
        continue
      }

      const existing = await Vote.findOne({ paymentReference: reference })
      if (existing) {
        results.skipped += 1
        continue
      }

      const award = await Award.findOne({ _id: awardId, eventId })
      if (!award) {
        results.skipped += 1
        continue
      }

      const contestant = await resolveContestant({ eventId, awardId, metadata })
      if (!contestant) {
        results.skipped += 1
        continue
      }

      const paidAmount = Number(data.amount || 0)
      const voteUnitAmount = Number(metadata.vote_unit_amount || DEFAULT_VOTE_UNIT)
      const quantityFromAmount = voteUnitAmount > 0 ? Math.round(paidAmount / voteUnitAmount) : 0
      const quantityFromMeta = Number(metadata.quantity || 0)
      const quantity = quantityFromAmount > 0 ? quantityFromAmount : quantityFromMeta

      if (!Number.isFinite(quantity) || quantity <= 0) {
        results.skipped += 1
        continue
      }

      if (paidAmount > 0 && voteUnitAmount > 0 && quantity * voteUnitAmount !== paidAmount) {
        results.skipped += 1
        continue
      }

      const email = String(metadata.email || data.customer?.email || '').trim().toLowerCase()
      const name = normalizeVoterName(metadata.name || metadata.voter_name || '', email)

      if (!email || !name) {
        results.skipped += 1
        continue
      }

      await Vote.create({
        eventId,
        awardId,
        contestantId: contestant._id,
        voterName: name,
        voterEmail: email,
        quantity,
        amountPaid: paidAmount,
        paymentReference: reference,
        transactionReference: data.reference || reference,
        paymentStatus: data.status === 'success' ? 'successful' : data.status || 'failed',
        paystackStatus: data.status || 'success',
        paystackPayload: data,
      })

      await Contestant.updateOne(
        { _id: contestant._id },
        { $inc: { voteCount: quantity, voterCount: 1 } }
      )

      await Award.updateOne(
        { _id: award._id, eventId, 'votes.paymentReference': { $ne: reference } },
        {
          $push: {
            votes: {
              name,
              email,
              nominee: contestant.name,
              quantity,
              amount: paidAmount,
              paymentReference: reference,
            },
          },
        }
      )

      results.inserted += 1
    } catch (error) {
      console.error('Recovery error for transaction:', error)
      results.errors += 1
    }
  }

  return results
}

async function loadTransactionsFromFile() {
  const filePath = process.env.RECOVERY_TRANSACTIONS_PATH
  if (!filePath) return []

  const raw = await fs.readFile(filePath, 'utf-8')
  const parsed = JSON.parse(raw)

  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.data)) return parsed.data
  if (Array.isArray(parsed?.transactions)) return parsed.transactions

  return []
}

async function main() {
  await connectDB()
  const transactions = await loadTransactionsFromFile()

  if (!transactions.length) {
    console.warn('No transactions loaded. Set RECOVERY_TRANSACTIONS_PATH to a JSON file path.')
    process.exit(0)
  }

  const results = await recoverVotesFromTransactions(transactions)
  console.log('Recovery summary:', results)
  process.exit(0)
}

if (process.argv[1] && process.argv[1].includes('recoverVotes.js')) {
  main().catch(error => {
    console.error('Recovery failed:', error)
    process.exit(1)
  })
}
