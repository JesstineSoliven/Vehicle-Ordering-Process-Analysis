# Workflow: Vehicle Ordering — End-to-End

**Version:** 1.0  
**Owner:** AutoVault Sales Operations  
**Last Updated:** 2026-05-21

---

## Objective

Process a customer vehicle order from initial inquiry through to vehicle delivery,
using the AutoVault AI-first toolchain. Eliminates all paper-based steps and
reduces customer visits to delivery only.

---

## Required Inputs

| Input | Source | Required? |
|---|---|---|
| Customer name, email, phone | Portal order form | Yes |
| Customer ID number & address | Portal order form | For contract |
| Vehicle ID & colour selection | Portal vehicle catalog | Yes |
| Financing type (cash/finance/lease) | Portal order form | Yes |
| Trade-in flag | Portal order form | Optional |

---

## Process Steps

### Step 1 — Receive Order

**Trigger:** Customer submits order via portal (`POST /api/orders`)  
**Tool:** `tools/order_manager.py → create_order()`  
**Action:**
- Validate all required fields
- Generate unique Order ID (`ORD-YYYYMM-XXXX`)
- Set status: `pending`

**Edge Cases:**
- Missing fields → return 422 with specific field errors
- Duplicate submission (same customer + vehicle within 24h) → warn and ask to confirm

---

### Step 2 — Reserve Inventory

**Trigger:** Order successfully created  
**Tool:** `tools/inventory_manager.py → reserve_vehicle()`  
**Action:**
- Check available quantity (`stock_quantity - reserved_quantity`)
- Reserve 1 unit; update `reserved_quantity`
- Log reservation to `data/reservations.json`

**Edge Cases:**
- No stock available → return 409 Conflict; customer placed on order queue with `delivery_weeks_order`
- Vehicle ID not found → return 404; log error

---

### Step 3 — Send Order Confirmation

**Trigger:** Inventory reserved  
**Tool:** `tools/notification_sender.py → send_notification(order_id, "order_confirmed")`  
**Action:**
- Send branded HTML email to customer with Order ID and next steps
- Log notification in order record

**Edge Cases:**
- Email delivery failure → log warning; do not fail the order; retry once
- Invalid email address → flag for manual follow-up

---

### Step 4 — Generate & Send First Payment Invoice

**Trigger:** Sales executive confirms deposit amount (or auto-calculated as 10% of vehicle price)  
**Tool:** `tools/invoice_generator.py → create_invoice(order_id, "first", amount)`  
**Action:**
- Generate HTML invoice with VAT breakdown
- Update order with `first_payment_amount`
- Email invoice to customer

**Edge Cases:**
- Amount not specified → default to 10% of vehicle price
- Customer requests instalment plan → escalate to finance team

---

### Step 5 — Generate & Send Digital Contract

**Trigger:** First payment received (invoice marked paid)  
**Tool:** `tools/document_generator.py → generate_sales_contract(order_id)`  
**Action:**
- Generate full HTML sales contract via Claude API (cached system prompt)
- Upload to e-signature service or deliver as secure link
- Update order status → `contract_sent`
- Send `contract_sent` notification

**Edge Cases:**
- Claude API timeout → retry once with exponential backoff; fall back to template-only contract
- Customer disputes a clause → escalate to legal; pause workflow
- ANTHROPIC_API_KEY missing → raise EnvironmentError with clear message

---

### Step 6 — Contract Signed

**Trigger:** Customer signs contract (e-signature webhook or manual confirmation)  
**Action:**
- Update status → `contract_signed`
- If vehicle in stock → skip to Step 7
- If order-in → trigger procurement: notify supply chain team

---

### Step 7 — Vehicle Sourcing / Manufacturing

**Trigger:** Contract signed  
**Action:**
- If in-stock: update status → `ready_for_delivery`
- If order-in: update status → `in_production`; set expected `delivery_date`
- Send automated milestone update when status changes to `ready_for_delivery`

---

### Step 8 — Schedule Delivery

**Trigger:** Vehicle ready  
**Tool:** `tools/order_manager.py → update_order_field(order_id, "delivery_date", date)`  
**Action:**
- Confirm delivery date with customer
- Update status → `delivery_scheduled`
- Send `delivery_scheduled` notification

---

### Step 9 — Final Payment & Final Invoice

**Trigger:** Delivery day confirmed  
**Tool:** `tools/invoice_generator.py → create_invoice(order_id, "final", balance_amount)`  
**Action:**
- Generate final HTML invoice
- Mark payment received → `payment_2_received`

---

### Step 10 — Generate Delivery Note & Handover

**Trigger:** Final payment cleared  
**Tool:** `tools/document_generator.py → generate_delivery_note(order_id)`  
**Action:**
- Generate delivery & handover certificate via Claude API
- Customer signs on tablet at handover
- Update status → `delivered`

---

### Step 11 — Post-Delivery Feedback

**Trigger:** 48 hours after delivery  
**Tool:** `tools/notification_sender.py → send_notification(order_id, "feedback_request")`  
**Action:**
- Send NPS email with 0–10 rating buttons
- Capture responses in analytics dashboard
- Update status → `completed`

---

## Success Criteria

- Order created with valid ID ✓
- Inventory reserved; no double-selling ✓
- Confirmation email delivered to customer ✓
- Contract generated and signed without office visit ✓
- Both invoices auto-generated with correct VAT ✓
- Delivery note created and signed at handover ✓
- NPS feedback sent within 48 hours of delivery ✓

---

## Error Escalation

| Error | Action |
|---|---|
| Inventory unavailable | Notify customer; offer order queue |
| Claude API failure | Retry 1x; fall back to static template; alert IT |
| Email delivery failure | Log and retry; alert sales executive after 3 failures |
| Contract dispute | Pause workflow; escalate to legal team |
| Payment failure | Notify customer; hold delivery |
