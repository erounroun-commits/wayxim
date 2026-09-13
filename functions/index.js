/**
 * Phase 2D — 서버 측 원장/번호 트랜잭션
 * 클라 appendLedgerEntry 와 idempotent 키를 공유합니다: `${type}_${refId}`
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const BAL_REF = () => db.collection('globalBalance').doc('current');
const ENTRY_REF = (id) => db.collection('ledgerEntries').doc(id);

async function appendLedgerInTransaction(tx, { type, amount, refType, refId, note, allowNegative }) {
  const amt = Math.abs(Number(amount) || 0);
  const isDebit = String(type).includes('debit');
  const signedAmount = isDebit ? -amt : amt;
  const entryId = `${type}_${refId}`;
  const entryRef = ENTRY_REF(entryId);
  const balRef = BAL_REF();

  const existing = await tx.get(entryRef);
  if (existing.exists) {
    return { skipped: true, id: entryId };
  }

  const balSnap = await tx.get(balRef);
  const prev = balSnap.exists ? (Number(balSnap.data().balance) || 0) : 0;
  const next = prev + signedAmount;
  if (isDebit && !allowNegative && next < 0) {
    throw new functions.https.HttpsError('failed-precondition', `잔액 부족 (${prev})`);
  }

  tx.set(entryRef, {
    type,
    amount: amt,
    signedAmount,
    refType: refType || '',
    refId: String(refId),
    note: String(note || ''),
    createdAt: Date.now(),
    source: 'cloud-functions'
  });
  tx.set(balRef, { balance: next, updatedAt: Date.now() }, { merge: true });
  return { id: entryId, balance: next };
}

/** 제출 생성 → 수수료 credit (제출 즉시) */
exports.onSubmissionCreated = functions.firestore
  .document('submissions/{submissionId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    if (data.isDeleted === true || data.isTest === true) return null;
    const commission = Number(data.commissionAtSubmission);
    if (!Number.isFinite(commission) || commission === 0) {
      functions.logger.warn('commissionAtSubmission 없음/0 — ledger skip', context.params.submissionId);
      return null;
    }

    await db.runTransaction(async (tx) => {
      await appendLedgerInTransaction(tx, {
        type: 'commission_credit',
        amount: commission,
        refType: 'submission',
        refId: context.params.submissionId,
        note: `no=${data.no || ''}`,
        allowNegative: true
      });
    });

    // vendorSummary 갱신
    const vendorId = String(data.vendorId || data.companyCode || '').trim();
    if (vendorId) {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const ref = db.collection('vendorSummary').doc(vendorId);
      await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const cur = s.exists ? s.data() : {};
        let monthlyCount = Number(cur.monthlyCount) || 0;
        if (cur.monthlyKey && cur.monthlyKey !== monthKey) monthlyCount = 0;
        const totalCnt = Number(data.totalCnt) || 0;
        tx.set(ref, {
          vendorId,
          companyCode: vendorId,
          companyName: data.companyName || cur.companyName || '',
          totalCount: (Number(cur.totalCount) || 0) + totalCnt,
          monthlyCount: monthlyCount + totalCnt,
          monthlyKey: monthKey,
          commissionTotal: (Number(cur.commissionTotal) || 0) + commission,
          submissionCount: (Number(cur.submissionCount) || 0) + 1,
          updatedAt: Date.now()
        }, { merge: true });
      });
    }
    return null;
  });

/** 출금 상태 변경 → debit / reversal */
exports.onWithdrawalUpdated = functions.firestore
  .document('withdrawals/{withdrawalId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const id = context.params.withdrawalId;
    const amount = typeof after.amount === 'number' ? after.amount : (parseFloat(after.amount) || 0);
    if (amount <= 0) return null;

    if (before.status !== 'completed' && after.status === 'completed') {
      await db.runTransaction(async (tx) => {
        await appendLedgerInTransaction(tx, {
          type: 'withdrawal_debit',
          amount,
          refType: 'withdrawal',
          refId: id,
          note: 'cf-complete',
          allowNegative: false
        });
      });
    } else if (before.status === 'completed' && after.status !== 'completed') {
      await db.runTransaction(async (tx) => {
        await appendLedgerInTransaction(tx, {
          type: 'withdrawal_reversal',
          amount,
          refType: 'withdrawal',
          refId: id,
          note: 'cf-uncomplete',
          allowNegative: true
        });
      });
    }
    return null;
  });

/** 수동 증액 생성 → manual_credit */
exports.onTopUpCreated = functions.firestore
  .document('availableTopUps/{topUpId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const amount = Number(data.amount) || 0;
    if (amount <= 0) return null;
    await db.runTransaction(async (tx) => {
      await appendLedgerInTransaction(tx, {
        type: 'manual_credit',
        amount,
        refType: 'topup',
        refId: context.params.topUpId,
        note: 'cf-topup',
        allowNegative: true
      });
    });
    return null;
  });

/** 번호 발급 (관리자/로그인 사용자) */
exports.allocateNextNo = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  const counterRef = db.collection('counters').doc('nextNo');
  const assigned = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    let current = 1;
    if (snap.exists) {
      current = Number(snap.data().nextNo) || 1;
      tx.update(counterRef, { nextNo: current + 1 });
    } else {
      tx.set(counterRef, { nextNo: 2 });
    }
    return current;
  });
  return { no: assigned };
});
