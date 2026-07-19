import { auth, db } from "../config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const repairsCollection = collection(db, "repairs");
const stocksCollection = collection(db, "stocks");
const expensesCollection = collection(db, "expenses");
const recurringBillsCollection = collection(db, "recurringBills");
const repairForm = document.getElementById("repairForm");
const repairId = document.getElementById("repairId");
const repairFormTitle = document.getElementById("repairFormTitle");
const repairMessage = document.getElementById("repairMessage");
const saveRepairButton = document.getElementById("saveRepairButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const showRepairFormButton = document.getElementById("showRepairFormButton");
const repairsTableBody = document.getElementById("repairsTableBody");
const repairSearch = document.getElementById("repairSearch");
const customerSearch = document.getElementById("customerSearch");
const customersTableBody = document.getElementById("customersTableBody");
const totalCustomers = document.getElementById("totalCustomers");
const activeCustomers = document.getElementById("activeCustomers");
const repeatCustomers = document.getElementById("repeatCustomers");
const customerBalance = document.getElementById("customerBalance");
const dashboardOpenRepairs = document.getElementById("dashboardOpenRepairs");
const dashboardReadyRepairs = document.getElementById("dashboardReadyRepairs");
const dashboardRevenue = document.getElementById("dashboardRevenue");
const dashboardBalance = document.getElementById("dashboardBalance");
const dashboardPriorityList = document.getElementById("dashboardPriorityList");
const dashboardStatusBreakdown = document.getElementById("dashboardStatusBreakdown");
const dashboardRecentTable = document.getElementById("dashboardRecentTable");
const reportPeriod = document.getElementById("reportPeriod");
const reportTickets = document.getElementById("reportTickets");
const reportCompleted = document.getElementById("reportCompleted");
const reportRevenue = document.getElementById("reportRevenue");
const reportOutstanding = document.getElementById("reportOutstanding");
const reportStatusBreakdown = document.getElementById("reportStatusBreakdown");
const reportPaymentBreakdown = document.getElementById("reportPaymentBreakdown");
const reportServicesTable = document.getElementById("reportServicesTable");
const stockForm = document.getElementById("stockForm");
const stockId = document.getElementById("stockId");
const stockFormTitle = document.getElementById("stockFormTitle");
const stockMessage = document.getElementById("stockMessage");
const saveStockButton = document.getElementById("saveStockButton");
const cancelStockEditButton = document.getElementById("cancelStockEditButton");
const showStockFormButton = document.getElementById("showStockFormButton");
const stocksTableBody = document.getElementById("stocksTableBody");
const stockSearch = document.getElementById("stockSearch");
const stockItemCount = document.getElementById("stockItemCount");
const stockUnitCount = document.getElementById("stockUnitCount");
const stockCostValue = document.getElementById("stockCostValue");
const lowStockCount = document.getElementById("lowStockCount");
const expenseForm = document.getElementById("expenseForm");
const expenseId = document.getElementById("expenseId");
const expenseFormTitle = document.getElementById("expenseFormTitle");
const expenseMessage = document.getElementById("expenseMessage");
const saveExpenseButton = document.getElementById("saveExpenseButton");
const cancelExpenseEditButton = document.getElementById("cancelExpenseEditButton");
const showExpenseFormButton = document.getElementById("showExpenseFormButton");
const expensesTableBody = document.getElementById("expensesTableBody");
const expenseSearch = document.getElementById("expenseSearch");
const billForm = document.getElementById("billForm");
const billId = document.getElementById("billId");
const billFormTitle = document.getElementById("billFormTitle");
const billMessage = document.getElementById("billMessage");
const saveBillButton = document.getElementById("saveBillButton");
const cancelBillEditButton = document.getElementById("cancelBillEditButton");
const showBillFormButton = document.getElementById("showBillFormButton");
const billsTableBody = document.getElementById("billsTableBody");
const billSearch = document.getElementById("billSearch");
const expenseCount = document.getElementById("expenseCount");
const expenseTotal = document.getElementById("expenseTotal");
const billTotal = document.getElementById("billTotal");
const unpaidBillCount = document.getElementById("unpaidBillCount");

let repairs = [];
let stocks = [];
let expenses = [];
let recurringBills = [];
let unsubscribeRepairs = null;
let unsubscribeStocks = null;
let unsubscribeExpenses = null;
let unsubscribeRecurringBills = null;
let currentUser = null;

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP"
});

const repairStatuses = [
  "Received",
  "Diagnosing",
  "Waiting for Approval",
  "Waiting for Parts",
  "In Progress",
  "Ready for Pickup",
  "Completed",
  "Cancelled"
];

const inactiveStatuses = new Set(["Completed", "Cancelled"]);
const priorityStatuses = new Set([
  "Received",
  "Diagnosing",
  "Waiting for Approval",
  "Waiting for Parts",
  "In Progress",
  "Ready for Pickup"
]);

function textValue(formData, key) {
  return String(formData.get(key) || "").trim();
}

function numberValue(formData, key) {
  const value = Number(formData.get(key) || 0);
  return Number.isFinite(value) ? value : 0;
}

function emptyToNull(value) {
  return value || null;
}

function buildTicketNo() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REP-${date}-${suffix}`;
}

function calculateEstimatedTotal(pricing) {
  return Math.max(
    0,
    pricing.diagnosticFee + pricing.partsCost + pricing.laborCost - pricing.discount
  );
}

function timestampToDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = timestampToDate(value);
  if (!date) {
    return "No date";
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getRepairTotal(repair) {
  return repair.pricing?.finalTotal || repair.pricing?.estimatedTotal || 0;
}

function getRepairBalance(repair) {
  return Math.max(0, getRepairTotal(repair) - (repair.pricing?.amountPaid || 0));
}

function getRepairPaid(repair) {
  return Math.min(getRepairTotal(repair), repair.pricing?.amountPaid || 0);
}

function getRepairDate(repair) {
  return timestampToDate(repair.updatedAt || repair.createdAt);
}

function isActiveRepair(repair) {
  return !inactiveStatuses.has(repair.repair?.status || "Received");
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function sumRepairs(repairItems, getValue) {
  return repairItems.reduce((sum, repair) => sum + getValue(repair), 0);
}

function renderBreakdown(container, counts, total) {
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No data yet.</p>';
    return;
  }

  container.innerHTML = entries.map(([label, count]) => {
    const percent = total ? Math.round((count / total) * 100) : 0;

    return `
      <div class="status-row">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${count} ticket${count === 1 ? "" : "s"}</span>
        </div>
        <div class="status-meter" aria-label="${escapeHtml(label)} ${percent}%">
          <span style="width: ${percent}%"></span>
        </div>
        <b>${percent}%</b>
      </div>
    `;
  }).join("");
}

function buildRepairPayload(formData, existingTicketNo) {
  const pricing = {
    diagnosticFee: numberValue(formData, "diagnosticFee"),
    partsCost: numberValue(formData, "partsCost"),
    laborCost: numberValue(formData, "laborCost"),
    discount: numberValue(formData, "discount"),
    finalTotal: numberValue(formData, "finalTotal"),
    amountPaid: numberValue(formData, "amountPaid"),
    paymentStatus: textValue(formData, "paymentStatus"),
    paymentMethod: emptyToNull(textValue(formData, "paymentMethod"))
  };

  pricing.estimatedTotal = calculateEstimatedTotal(pricing);

  return {
    ticketNo: existingTicketNo || buildTicketNo(),
    customer: {
      name: textValue(formData, "customerName"),
      phone: textValue(formData, "customerPhone"),
      email: emptyToNull(textValue(formData, "customerEmail")),
      address: emptyToNull(textValue(formData, "customerAddress"))
    },
    device: {
      type: textValue(formData, "deviceType"),
      brand: textValue(formData, "deviceBrand"),
      model: textValue(formData, "deviceModel"),
      serialOrImei: emptyToNull(textValue(formData, "serialOrImei")),
      password: emptyToNull(textValue(formData, "devicePassword")),
      accessories: emptyToNull(textValue(formData, "accessories")),
      condition: emptyToNull(textValue(formData, "condition"))
    },
    repair: {
      category: textValue(formData, "repairCategory"),
      serviceType: emptyToNull(textValue(formData, "serviceType")),
      reportedIssue: textValue(formData, "reportedIssue"),
      diagnosis: emptyToNull(textValue(formData, "diagnosis")),
      priority: textValue(formData, "priority"),
      status: textValue(formData, "status"),
      assignedTechnician: emptyToNull(textValue(formData, "assignedTechnician")),
      notes: emptyToNull(textValue(formData, "notes"))
    },
    pricing,
    dates: {
      estimatedCompletion: emptyToNull(textValue(formData, "estimatedCompletion")),
      warrantyUntil: emptyToNull(textValue(formData, "warrantyUntil"))
    },
    customerNotified: false,
    updatedAt: serverTimestamp()
  };
}

function setMessage(message, type = "error") {
  repairMessage.textContent = message;
  repairMessage.dataset.type = type;
}

function setScopedMessage(element, message, type = "error") {
  element.textContent = message;
  element.dataset.type = type;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function showStockForm() {
  stockForm.classList.remove("hidden");
  showStockFormButton.classList.add("hidden");
}

function hideStockForm() {
  stockForm.classList.add("hidden");
  showStockFormButton.classList.remove("hidden");
}

function resetStockForm(options = {}) {
  stockForm.reset();
  stockId.value = "";
  stockFormTitle.textContent = "New stock item";
  saveStockButton.textContent = "Save stock item";
  stockForm.elements.namedItem("quantity").value = "0";
  stockForm.elements.namedItem("reorderLevel").value = "0";
  stockForm.elements.namedItem("unitCost").value = "0";
  stockForm.elements.namedItem("sellingPrice").value = "0";
  setScopedMessage(stockMessage, "");

  if (options.hide !== false) {
    hideStockForm();
  }
}

function buildStockPayload(formData) {
  return {
    itemName: textValue(formData, "itemName"),
    category: textValue(formData, "category"),
    sku: emptyToNull(textValue(formData, "sku")),
    quantity: numberValue(formData, "quantity"),
    reorderLevel: numberValue(formData, "reorderLevel"),
    unitCost: numberValue(formData, "unitCost"),
    sellingPrice: numberValue(formData, "sellingPrice"),
    supplier: emptyToNull(textValue(formData, "supplier")),
    compatibleModel: emptyToNull(textValue(formData, "compatibleModel")),
    notes: emptyToNull(textValue(formData, "notes")),
    updatedAt: serverTimestamp()
  };
}

function fillStockForm(stock) {
  showStockForm();
  stockId.value = stock.id;
  stockFormTitle.textContent = `Edit ${stock.itemName || "stock item"}`;
  saveStockButton.textContent = "Update stock item";

  [
    "itemName",
    "category",
    "sku",
    "quantity",
    "reorderLevel",
    "unitCost",
    "sellingPrice",
    "supplier",
    "compatibleModel",
    "notes"
  ].forEach((name) => {
    const field = stockForm.elements.namedItem(name);
    if (field) {
      field.value = stock[name] ?? "";
    }
  });

  stockForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getStockSearchText(stock) {
  return [
    stock.itemName,
    stock.category,
    stock.sku,
    stock.supplier,
    stock.compatibleModel,
    stock.notes
  ].join(" ").toLowerCase();
}

function renderStockSummary() {
  const units = stocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
  const costValue = stocks.reduce((sum, stock) => {
    return sum + ((stock.quantity || 0) * (stock.unitCost || 0));
  }, 0);
  const lowCount = stocks.filter((stock) => {
    const reorderLevel = stock.reorderLevel || 0;
    return reorderLevel > 0 && (stock.quantity || 0) <= reorderLevel;
  }).length;

  stockItemCount.textContent = String(stocks.length);
  stockUnitCount.textContent = String(units);
  stockCostValue.textContent = moneyFormatter.format(costValue);
  lowStockCount.textContent = String(lowCount);
}

function renderStocks() {
  const term = stockSearch.value.trim().toLowerCase();
  const visibleStocks = term
    ? stocks.filter((stock) => getStockSearchText(stock).includes(term))
    : stocks;

  renderStockSummary();

  if (!visibleStocks.length) {
    stocksTableBody.innerHTML = `
      <tr>
        <td colspan="8">${term ? "No matching stock items found." : "No stock items yet."}</td>
      </tr>
    `;
    return;
  }

  stocksTableBody.innerHTML = visibleStocks.map((stock) => {
    const isLow = (stock.reorderLevel || 0) > 0 && (stock.quantity || 0) <= (stock.reorderLevel || 0);

    return `
      <tr>
        <td>
          <strong>${escapeHtml(stock.itemName || "")}</strong>
          <span>${escapeHtml(stock.sku || stock.compatibleModel || "No SKU")}</span>
        </td>
        <td>${escapeHtml(stock.category || "")}</td>
        <td>
          <strong class="${isLow ? "danger-text" : ""}">${stock.quantity || 0}</strong>
          <span>Reorder at ${stock.reorderLevel || 0}</span>
        </td>
        <td>${moneyFormatter.format(stock.unitCost || 0)}</td>
        <td>${moneyFormatter.format(stock.sellingPrice || 0)}</td>
        <td>${escapeHtml(stock.supplier || "No supplier")}</td>
        <td>${formatDate(stock.updatedAt || stock.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-action="edit-stock" data-id="${stock.id}">Edit</button>
            <button type="button" data-action="delete-stock" data-id="${stock.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function showExpenseForm() {
  expenseForm.classList.remove("hidden");
  showExpenseFormButton.classList.add("hidden");
}

function hideExpenseForm() {
  expenseForm.classList.add("hidden");
  showExpenseFormButton.classList.remove("hidden");
}

function resetExpenseForm(options = {}) {
  expenseForm.reset();
  expenseId.value = "";
  expenseFormTitle.textContent = "New expense";
  saveExpenseButton.textContent = "Save expense";
  expenseForm.elements.namedItem("amount").value = "0";
  expenseForm.elements.namedItem("expenseDate").value = todayInputValue();
  setScopedMessage(expenseMessage, "");

  if (options.hide !== false) {
    hideExpenseForm();
  }
}

function buildExpensePayload(formData) {
  return {
    expenseName: textValue(formData, "expenseName"),
    category: textValue(formData, "category"),
    amount: numberValue(formData, "amount"),
    expenseDate: emptyToNull(textValue(formData, "expenseDate")),
    vendor: emptyToNull(textValue(formData, "vendor")),
    paymentMethod: emptyToNull(textValue(formData, "paymentMethod")),
    notes: emptyToNull(textValue(formData, "notes")),
    updatedAt: serverTimestamp()
  };
}

function fillExpenseForm(expense) {
  showExpenseForm();
  expenseId.value = expense.id;
  expenseFormTitle.textContent = `Edit ${expense.expenseName || "expense"}`;
  saveExpenseButton.textContent = "Update expense";

  ["expenseName", "category", "amount", "expenseDate", "vendor", "paymentMethod", "notes"].forEach((name) => {
    const field = expenseForm.elements.namedItem(name);
    if (field) {
      field.value = expense[name] ?? "";
    }
  });

  expenseForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getExpenseSearchText(expense) {
  return [
    expense.expenseName,
    expense.category,
    expense.vendor,
    expense.paymentMethod,
    expense.notes
  ].join(" ").toLowerCase();
}

function showBillForm() {
  billForm.classList.remove("hidden");
  showBillFormButton.classList.add("hidden");
}

function hideBillForm() {
  billForm.classList.add("hidden");
  showBillFormButton.classList.remove("hidden");
}

function resetBillForm(options = {}) {
  billForm.reset();
  billId.value = "";
  billFormTitle.textContent = "New rent, electricity, or wifi bill";
  saveBillButton.textContent = "Save bill";
  billForm.elements.namedItem("amount").value = "0";
  billForm.elements.namedItem("status").value = "Unpaid";
  setScopedMessage(billMessage, "");

  if (options.hide !== false) {
    hideBillForm();
  }
}

function buildBillPayload(formData) {
  return {
    billType: textValue(formData, "billType"),
    provider: emptyToNull(textValue(formData, "provider")),
    amount: numberValue(formData, "amount"),
    dueDate: emptyToNull(textValue(formData, "dueDate")),
    paidDate: emptyToNull(textValue(formData, "paidDate")),
    status: textValue(formData, "status"),
    notes: emptyToNull(textValue(formData, "notes")),
    updatedAt: serverTimestamp()
  };
}

function fillBillForm(bill) {
  showBillForm();
  billId.value = bill.id;
  billFormTitle.textContent = `Edit ${bill.billType || "bill"}`;
  saveBillButton.textContent = "Update bill";

  ["billType", "provider", "amount", "dueDate", "paidDate", "status", "notes"].forEach((name) => {
    const field = billForm.elements.namedItem(name);
    if (field) {
      field.value = bill[name] ?? "";
    }
  });

  billForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getBillSearchText(bill) {
  return [
    bill.billType,
    bill.provider,
    bill.status,
    bill.notes
  ].join(" ").toLowerCase();
}

function renderExpenseSummary() {
  const generalTotal = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const recurringTotal = recurringBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const unpaidCount = recurringBills.filter((bill) => bill.status !== "Paid").length;

  expenseCount.textContent = String(expenses.length);
  expenseTotal.textContent = moneyFormatter.format(generalTotal);
  billTotal.textContent = moneyFormatter.format(recurringTotal);
  unpaidBillCount.textContent = String(unpaidCount);
}

function renderExpenses() {
  const term = expenseSearch.value.trim().toLowerCase();
  const visibleExpenses = term
    ? expenses.filter((expense) => getExpenseSearchText(expense).includes(term))
    : expenses;

  renderExpenseSummary();

  if (!visibleExpenses.length) {
    expensesTableBody.innerHTML = `
      <tr>
        <td colspan="7">${term ? "No matching expenses found." : "No expenses yet."}</td>
      </tr>
    `;
    return;
  }

  expensesTableBody.innerHTML = visibleExpenses.map((expense) => `
    <tr>
      <td>
        <strong>${escapeHtml(expense.expenseName || "")}</strong>
        <span>${escapeHtml(expense.notes || "No notes")}</span>
      </td>
      <td>${escapeHtml(expense.category || "")}</td>
      <td>${moneyFormatter.format(expense.amount || 0)}</td>
      <td>${expense.expenseDate ? escapeHtml(expense.expenseDate) : formatDate(expense.createdAt)}</td>
      <td>${escapeHtml(expense.vendor || "No vendor")}</td>
      <td>${escapeHtml(expense.paymentMethod || "No method")}</td>
      <td>
        <div class="row-actions">
          <button type="button" data-action="edit-expense" data-id="${expense.id}">Edit</button>
          <button type="button" data-action="delete-expense" data-id="${expense.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderBills() {
  const term = billSearch.value.trim().toLowerCase();
  const visibleBills = term
    ? recurringBills.filter((bill) => getBillSearchText(bill).includes(term))
    : recurringBills;

  renderExpenseSummary();

  if (!visibleBills.length) {
    billsTableBody.innerHTML = `
      <tr>
        <td colspan="7">${term ? "No matching bills found." : "No rent, electricity, or wifi bills yet."}</td>
      </tr>
    `;
    return;
  }

  billsTableBody.innerHTML = visibleBills.map((bill) => `
    <tr>
      <td>
        <strong>${escapeHtml(bill.billType || "")}</strong>
        <span>${escapeHtml(bill.notes || "No notes")}</span>
      </td>
      <td>${escapeHtml(bill.provider || "No provider")}</td>
      <td>${moneyFormatter.format(bill.amount || 0)}</td>
      <td>${escapeHtml(bill.dueDate || "No due date")}</td>
      <td>${escapeHtml(bill.paidDate || "Not paid")}</td>
      <td><span class="status-pill">${escapeHtml(bill.status || "Unpaid")}</span></td>
      <td>
        <div class="row-actions">
          <button type="button" data-action="edit-bill" data-id="${bill.id}">Edit</button>
          <button type="button" data-action="delete-bill" data-id="${bill.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function showForm() {
  repairForm.classList.remove("hidden");
  showRepairFormButton.classList.add("hidden");
}

function hideForm() {
  repairForm.classList.add("hidden");
  showRepairFormButton.classList.remove("hidden");
}

function resetForm(options = {}) {
  repairForm.reset();
  repairId.value = "";
  repairFormTitle.textContent = "New repair ticket";
  saveRepairButton.textContent = "Save repair";
  setMessage("");
  repairForm.querySelector('[name="priority"]').value = "Normal";
  repairForm.querySelector('[name="status"]').value = "Received";
  repairForm.querySelector('[name="paymentStatus"]').value = "Unpaid";
  ["diagnosticFee", "partsCost", "laborCost", "discount", "finalTotal", "amountPaid"].forEach((name) => {
    repairForm.querySelector(`[name="${name}"]`).value = "0";
  });

  if (options.hide !== false) {
    hideForm();
  }
}

function fillForm(repair) {
  showForm();
  repairId.value = repair.id;
  repairFormTitle.textContent = `Edit ${repair.ticketNo}`;
  saveRepairButton.textContent = "Update repair";

  const values = {
    customerName: repair.customer?.name,
    customerPhone: repair.customer?.phone,
    customerEmail: repair.customer?.email,
    customerAddress: repair.customer?.address,
    deviceType: repair.device?.type,
    deviceBrand: repair.device?.brand,
    deviceModel: repair.device?.model,
    serialOrImei: repair.device?.serialOrImei,
    devicePassword: repair.device?.password,
    accessories: repair.device?.accessories,
    condition: repair.device?.condition,
    repairCategory: repair.repair?.category,
    serviceType: repair.repair?.serviceType,
    priority: repair.repair?.priority,
    status: repair.repair?.status,
    assignedTechnician: repair.repair?.assignedTechnician,
    estimatedCompletion: repair.dates?.estimatedCompletion,
    reportedIssue: repair.repair?.reportedIssue,
    diagnosis: repair.repair?.diagnosis,
    notes: repair.repair?.notes,
    diagnosticFee: repair.pricing?.diagnosticFee,
    partsCost: repair.pricing?.partsCost,
    laborCost: repair.pricing?.laborCost,
    discount: repair.pricing?.discount,
    finalTotal: repair.pricing?.finalTotal,
    amountPaid: repair.pricing?.amountPaid,
    paymentStatus: repair.pricing?.paymentStatus,
    paymentMethod: repair.pricing?.paymentMethod,
    warrantyUntil: repair.dates?.warrantyUntil
  };

  Object.entries(values).forEach(([name, value]) => {
    const field = repairForm.elements.namedItem(name);
    if (field) {
      field.value = value ?? "";
    }
  });

  repairForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getSearchText(repair) {
  return [
    repair.ticketNo,
    repair.customer?.name,
    repair.customer?.phone,
    repair.device?.type,
    repair.device?.brand,
    repair.device?.model,
    repair.repair?.reportedIssue,
    repair.repair?.status
  ].join(" ").toLowerCase();
}

function renderRepairs() {
  const term = repairSearch.value.trim().toLowerCase();
  const visibleRepairs = term
    ? repairs.filter((repair) => getSearchText(repair).includes(term))
    : repairs;

  if (!visibleRepairs.length) {
    repairsTableBody.innerHTML = `
      <tr>
        <td colspan="7">${term ? "No matching repairs found." : "No repair tickets yet."}</td>
      </tr>
    `;
    return;
  }

  repairsTableBody.innerHTML = visibleRepairs.map((repair) => {
    const device = [repair.device?.brand, repair.device?.model].filter(Boolean).join(" ");
    const status = repair.repair?.status || "Received";
    const total = repair.pricing?.finalTotal || repair.pricing?.estimatedTotal || 0;
    const statusOptions = repairStatuses.map((repairStatus) => {
      const selected = repairStatus === status ? "selected" : "";
      return `<option ${selected}>${escapeHtml(repairStatus)}</option>`;
    }).join("");

    return `
      <tr>
        <td><strong>${escapeHtml(repair.ticketNo)}</strong></td>
        <td>
          <strong>${escapeHtml(repair.customer?.name || "")}</strong>
          <span>${escapeHtml(repair.customer?.phone || "")}</span>
        </td>
        <td>
          <strong>${escapeHtml(repair.device?.type || "")}</strong>
          <span>${escapeHtml(device)}</span>
        </td>
        <td>${escapeHtml(repair.repair?.reportedIssue || "")}</td>
        <td>
          <select class="status-select" data-action="status" data-id="${repair.id}" aria-label="Change status for ${escapeHtml(repair.ticketNo)}">
            ${statusOptions}
          </select>
        </td>
        <td>${moneyFormatter.format(total)}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-action="edit" data-id="${repair.id}">Edit</button>
            <button type="button" data-action="delete" data-id="${repair.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function getCustomerKey(repair) {
  const email = repair.customer?.email;
  const phone = repair.customer?.phone;
  const name = repair.customer?.name;

  return String(email || phone || name || repair.id).trim().toLowerCase();
}

function buildCustomers() {
  const customerMap = new Map();

  repairs.forEach((repair) => {
    const key = getCustomerKey(repair);
    const existing = customerMap.get(key);
    const customer = existing || {
      key,
      name: repair.customer?.name || "Unnamed customer",
      phone: repair.customer?.phone || "",
      email: repair.customer?.email || "",
      address: repair.customer?.address || "",
      repairs: [],
      activeRepairs: [],
      totalSpent: 0,
      balance: 0,
      lastVisit: null
    };

    const status = repair.repair?.status || "Received";
    const updatedAt = timestampToDate(repair.updatedAt || repair.createdAt);

    customer.repairs.push(repair);
    customer.totalSpent += getRepairTotal(repair);
    customer.balance += getRepairBalance(repair);

    if (!inactiveStatuses.has(status)) {
      customer.activeRepairs.push(repair);
    }

    if (updatedAt && (!customer.lastVisit || updatedAt > customer.lastVisit)) {
      customer.lastVisit = updatedAt;
    }

    customer.name = customer.name || repair.customer?.name || "Unnamed customer";
    customer.phone = customer.phone || repair.customer?.phone || "";
    customer.email = customer.email || repair.customer?.email || "";
    customer.address = customer.address || repair.customer?.address || "";

    customerMap.set(key, customer);
  });

  return Array.from(customerMap.values()).sort((a, b) => {
    const aTime = a.lastVisit?.getTime() || 0;
    const bTime = b.lastVisit?.getTime() || 0;
    return bTime - aTime;
  });
}

function getCustomerSearchText(customer) {
  return [
    customer.name,
    customer.phone,
    customer.email,
    customer.address,
    ...customer.repairs.flatMap((repair) => [
      repair.ticketNo,
      repair.device?.type,
      repair.device?.brand,
      repair.device?.model,
      repair.repair?.status
    ])
  ].join(" ").toLowerCase();
}

function renderCustomerSummary(customers) {
  const activeCount = customers.filter((customer) => customer.activeRepairs.length).length;
  const repeatCount = customers.filter((customer) => customer.repairs.length > 1).length;
  const balanceTotal = customers.reduce((sum, customer) => sum + customer.balance, 0);

  totalCustomers.textContent = String(customers.length);
  activeCustomers.textContent = String(activeCount);
  repeatCustomers.textContent = String(repeatCount);
  customerBalance.textContent = moneyFormatter.format(balanceTotal);
}

function renderCustomers() {
  const customers = buildCustomers();
  const term = customerSearch.value.trim().toLowerCase();
  const visibleCustomers = term
    ? customers.filter((customer) => getCustomerSearchText(customer).includes(term))
    : customers;

  renderCustomerSummary(customers);

  if (!visibleCustomers.length) {
    customersTableBody.innerHTML = `
      <tr>
        <td colspan="8">${term ? "No matching customers found." : "No customers yet."}</td>
      </tr>
    `;
    return;
  }

  customersTableBody.innerHTML = visibleCustomers.map((customer) => {
    const activeTicket = customer.activeRepairs[0];
    const activeText = activeTicket
      ? `${activeTicket.ticketNo} - ${activeTicket.repair?.status || "Received"}`
      : "None";
    const contactSearch = customer.email || customer.phone || customer.name;

    return `
      <tr>
        <td>
          <strong>${escapeHtml(customer.name)}</strong>
          <span>${escapeHtml(customer.address || "No address")}</span>
        </td>
        <td>
          <strong>${escapeHtml(customer.phone || "No phone")}</strong>
          <span>${escapeHtml(customer.email || "No email")}</span>
        </td>
        <td>
          <strong>${customer.repairs.length}</strong>
          <span>${customer.repairs.length > 1 ? "Repeat customer" : "First repair"}</span>
        </td>
        <td>
          <span class="status-pill">${escapeHtml(activeText)}</span>
        </td>
        <td>${moneyFormatter.format(customer.totalSpent)}</td>
        <td>${moneyFormatter.format(customer.balance)}</td>
        <td>${formatDate(customer.lastVisit)}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-action="view-customer-repairs" data-search="${escapeHtml(contactSearch)}">View repairs</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderDashboard() {
  const openRepairs = repairs.filter(isActiveRepair);
  const readyRepairs = repairs.filter((repair) => repair.repair?.status === "Ready for Pickup");
  const revenue = sumRepairs(repairs, getRepairPaid);
  const balance = sumRepairs(repairs, getRepairBalance);

  dashboardOpenRepairs.textContent = String(openRepairs.length);
  dashboardReadyRepairs.textContent = String(readyRepairs.length);
  dashboardRevenue.textContent = moneyFormatter.format(revenue);
  dashboardBalance.textContent = moneyFormatter.format(balance);

  const priorityRepairs = repairs
    .filter((repair) => priorityStatuses.has(repair.repair?.status || "Received"))
    .slice(0, 5);

  dashboardPriorityList.innerHTML = priorityRepairs.length
    ? priorityRepairs.map((repair) => {
      const device = [repair.device?.brand, repair.device?.model].filter(Boolean).join(" ");

      return `
        <article class="mini-item">
          <div>
            <strong>${escapeHtml(repair.ticketNo)}</strong>
            <span>${escapeHtml(repair.customer?.name || "Unnamed customer")}</span>
          </div>
          <div>
            <strong>${escapeHtml(repair.repair?.status || "Received")}</strong>
            <span>${escapeHtml(device || repair.device?.type || "No device")}</span>
          </div>
        </article>
      `;
    }).join("")
    : '<p class="empty-state">No active repair queue yet.</p>';

  renderBreakdown(
    dashboardStatusBreakdown,
    countBy(repairs, (repair) => repair.repair?.status || "Received"),
    repairs.length
  );

  const recentRepairs = repairs.slice(0, 6);
  dashboardRecentTable.innerHTML = recentRepairs.length
    ? recentRepairs.map((repair) => {
      const device = [repair.device?.brand, repair.device?.model].filter(Boolean).join(" ");

      return `
        <tr>
          <td><strong>${escapeHtml(repair.ticketNo)}</strong></td>
          <td>${escapeHtml(repair.customer?.name || "Unnamed customer")}</td>
          <td>
            <strong>${escapeHtml(repair.device?.type || "No type")}</strong>
            <span>${escapeHtml(device)}</span>
          </td>
          <td><span class="status-pill">${escapeHtml(repair.repair?.status || "Received")}</span></td>
          <td>${moneyFormatter.format(getRepairBalance(repair))}</td>
          <td>${formatDate(getRepairDate(repair))}</td>
        </tr>
      `;
    }).join("")
    : `
      <tr>
        <td colspan="6">No repair tickets yet.</td>
      </tr>
    `;
}

function getReportRepairs() {
  const value = reportPeriod.value;
  const now = new Date();
  let startDate = null;

  if (value === "7" || value === "30") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - Number(value));
  }

  if (value === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  if (!startDate) {
    return repairs;
  }

  return repairs.filter((repair) => {
    const repairDate = getRepairDate(repair);
    return repairDate && repairDate >= startDate;
  });
}

function renderReports() {
  const reportRepairs = getReportRepairs();
  const completedRepairs = reportRepairs.filter((repair) => repair.repair?.status === "Completed");
  const revenue = sumRepairs(reportRepairs, getRepairPaid);
  const outstanding = sumRepairs(reportRepairs, getRepairBalance);

  reportTickets.textContent = String(reportRepairs.length);
  reportCompleted.textContent = String(completedRepairs.length);
  reportRevenue.textContent = moneyFormatter.format(revenue);
  reportOutstanding.textContent = moneyFormatter.format(outstanding);

  renderBreakdown(
    reportStatusBreakdown,
    countBy(reportRepairs, (repair) => repair.repair?.status || "Received"),
    reportRepairs.length
  );

  renderBreakdown(
    reportPaymentBreakdown,
    countBy(reportRepairs, (repair) => repair.pricing?.paymentStatus || "Unpaid"),
    reportRepairs.length
  );

  const serviceMap = new Map();
  reportRepairs.forEach((repair) => {
    const service = repair.repair?.serviceType || repair.repair?.category || "Unspecified";
    const current = serviceMap.get(service) || {
      service,
      tickets: 0,
      revenue: 0,
      outstanding: 0
    };

    current.tickets += 1;
    current.revenue += getRepairPaid(repair);
    current.outstanding += getRepairBalance(repair);
    serviceMap.set(service, current);
  });

  const services = Array.from(serviceMap.values())
    .sort((a, b) => b.tickets - a.tickets || b.revenue - a.revenue)
    .slice(0, 10);

  reportServicesTable.innerHTML = services.length
    ? services.map((service) => `
      <tr>
        <td><strong>${escapeHtml(service.service)}</strong></td>
        <td>${service.tickets}</td>
        <td>${moneyFormatter.format(service.revenue)}</td>
        <td>${moneyFormatter.format(service.outstanding)}</td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="4">No service data for this period.</td>
      </tr>
    `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function listenForRepairs() {
  if (unsubscribeRepairs) {
    unsubscribeRepairs();
  }

  const repairsQuery = query(repairsCollection, orderBy("updatedAt", "desc"));
  unsubscribeRepairs = onSnapshot(
    repairsQuery,
    (snapshot) => {
      repairs = snapshot.docs.map((repairDoc) => ({
        id: repairDoc.id,
        ...repairDoc.data()
      }));
      renderRepairs();
      renderCustomers();
      renderDashboard();
      renderReports();
    },
    (error) => {
      repairsTableBody.innerHTML = `
        <tr>
          <td colspan="7">Unable to load repairs: ${escapeHtml(error.message)}</td>
        </tr>
      `;
      customersTableBody.innerHTML = `
        <tr>
          <td colspan="8">Unable to load customers: ${escapeHtml(error.message)}</td>
        </tr>
      `;
      dashboardRecentTable.innerHTML = `
        <tr>
          <td colspan="6">Unable to load dashboard data: ${escapeHtml(error.message)}</td>
        </tr>
      `;
      reportServicesTable.innerHTML = `
        <tr>
          <td colspan="4">Unable to load reports: ${escapeHtml(error.message)}</td>
        </tr>
      `;
    }
  );
}

function listenForStocks() {
  if (unsubscribeStocks) {
    unsubscribeStocks();
  }

  const stocksQuery = query(stocksCollection, orderBy("updatedAt", "desc"));
  unsubscribeStocks = onSnapshot(
    stocksQuery,
    (snapshot) => {
      stocks = snapshot.docs.map((stockDoc) => ({
        id: stockDoc.id,
        ...stockDoc.data()
      }));
      renderStocks();
    },
    (error) => {
      stocksTableBody.innerHTML = `
        <tr>
          <td colspan="8">Unable to load stocks: ${escapeHtml(error.message)}</td>
        </tr>
      `;
    }
  );
}

function listenForExpenses() {
  if (unsubscribeExpenses) {
    unsubscribeExpenses();
  }

  const expensesQuery = query(expensesCollection, orderBy("updatedAt", "desc"));
  unsubscribeExpenses = onSnapshot(
    expensesQuery,
    (snapshot) => {
      expenses = snapshot.docs.map((expenseDoc) => ({
        id: expenseDoc.id,
        ...expenseDoc.data()
      }));
      renderExpenses();
    },
    (error) => {
      expensesTableBody.innerHTML = `
        <tr>
          <td colspan="7">Unable to load expenses: ${escapeHtml(error.message)}</td>
        </tr>
      `;
    }
  );
}

function listenForRecurringBills() {
  if (unsubscribeRecurringBills) {
    unsubscribeRecurringBills();
  }

  const billsQuery = query(recurringBillsCollection, orderBy("updatedAt", "desc"));
  unsubscribeRecurringBills = onSnapshot(
    billsQuery,
    (snapshot) => {
      recurringBills = snapshot.docs.map((billDoc) => ({
        id: billDoc.id,
        ...billDoc.data()
      }));
      renderBills();
    },
    (error) => {
      billsTableBody.innerHTML = `
        <tr>
          <td colspan="7">Unable to load bills: ${escapeHtml(error.message)}</td>
        </tr>
      `;
    }
  );
}

repairForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");
  saveRepairButton.disabled = true;

  const formData = new FormData(repairForm);
  const editingId = repairId.value;
  const existingRepair = repairs.find((repair) => repair.id === editingId);
  const payload = buildRepairPayload(formData, existingRepair?.ticketNo);

  try {
    if (editingId) {
      await updateDoc(doc(db, "repairs", editingId), payload);
      resetForm();
      setMessage("Repair ticket updated.", "success");
    } else {
      await addDoc(repairsCollection, {
        ...payload,
        createdBy: currentUser?.uid || null,
        createdAt: serverTimestamp()
      });
      resetForm();
      setMessage("Repair ticket saved.", "success");
    }
  } catch (error) {
    setMessage(`Unable to save repair: ${error.message}`);
  } finally {
    saveRepairButton.disabled = false;
  }
});

stockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setScopedMessage(stockMessage, "");
  saveStockButton.disabled = true;

  const formData = new FormData(stockForm);
  const editingId = stockId.value;
  const payload = buildStockPayload(formData);

  try {
    if (editingId) {
      await updateDoc(doc(db, "stocks", editingId), payload);
      resetStockForm();
      setScopedMessage(stockMessage, "Stock item updated.", "success");
    } else {
      await addDoc(stocksCollection, {
        ...payload,
        createdBy: currentUser?.uid || null,
        createdAt: serverTimestamp()
      });
      resetStockForm();
      setScopedMessage(stockMessage, "Stock item saved.", "success");
    }
  } catch (error) {
    setScopedMessage(stockMessage, `Unable to save stock item: ${error.message}`);
  } finally {
    saveStockButton.disabled = false;
  }
});

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setScopedMessage(expenseMessage, "");
  saveExpenseButton.disabled = true;

  const formData = new FormData(expenseForm);
  const editingId = expenseId.value;
  const payload = buildExpensePayload(formData);

  try {
    if (editingId) {
      await updateDoc(doc(db, "expenses", editingId), payload);
      resetExpenseForm();
      setScopedMessage(expenseMessage, "Expense updated.", "success");
    } else {
      await addDoc(expensesCollection, {
        ...payload,
        createdBy: currentUser?.uid || null,
        createdAt: serverTimestamp()
      });
      resetExpenseForm();
      setScopedMessage(expenseMessage, "Expense saved.", "success");
    }
  } catch (error) {
    setScopedMessage(expenseMessage, `Unable to save expense: ${error.message}`);
  } finally {
    saveExpenseButton.disabled = false;
  }
});

billForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setScopedMessage(billMessage, "");
  saveBillButton.disabled = true;

  const formData = new FormData(billForm);
  const editingId = billId.value;
  const payload = buildBillPayload(formData);

  try {
    if (editingId) {
      await updateDoc(doc(db, "recurringBills", editingId), payload);
      resetBillForm();
      setScopedMessage(billMessage, "Bill updated.", "success");
    } else {
      await addDoc(recurringBillsCollection, {
        ...payload,
        createdBy: currentUser?.uid || null,
        createdAt: serverTimestamp()
      });
      resetBillForm();
      setScopedMessage(billMessage, "Bill saved.", "success");
    }
  } catch (error) {
    setScopedMessage(billMessage, `Unable to save bill: ${error.message}`);
  } finally {
    saveBillButton.disabled = false;
  }
});

repairsTableBody.addEventListener("change", async (event) => {
  const select = event.target.closest('select[data-action="status"]');
  if (!select) {
    return;
  }

  const selectedRepair = repairs.find((repair) => repair.id === select.dataset.id);
  if (!selectedRepair) {
    return;
  }

  select.disabled = true;

  try {
    await updateDoc(doc(db, "repairs", selectedRepair.id), {
      "repair.status": select.value,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    select.value = selectedRepair.repair?.status || "Received";
    window.alert(`Unable to update status: ${error.message}`);
  } finally {
    select.disabled = false;
  }
});

repairsTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const selectedRepair = repairs.find((repair) => repair.id === button.dataset.id);
  if (!selectedRepair) {
    return;
  }

  if (button.dataset.action === "edit") {
    fillForm(selectedRepair);
    return;
  }

  if (button.dataset.action === "delete") {
    const confirmed = window.confirm(`Delete ${selectedRepair.ticketNo}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    await deleteDoc(doc(db, "repairs", selectedRepair.id));
    if (repairId.value === selectedRepair.id) {
      resetForm();
    }
  }
});

stocksTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const selectedStock = stocks.find((stock) => stock.id === button.dataset.id);
  if (!selectedStock) {
    return;
  }

  if (button.dataset.action === "edit-stock") {
    fillStockForm(selectedStock);
    return;
  }

  if (button.dataset.action === "delete-stock") {
    const confirmed = window.confirm(`Delete ${selectedStock.itemName || "this stock item"}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    await deleteDoc(doc(db, "stocks", selectedStock.id));
    if (stockId.value === selectedStock.id) {
      resetStockForm();
    }
  }
});

expensesTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const selectedExpense = expenses.find((expense) => expense.id === button.dataset.id);
  if (!selectedExpense) {
    return;
  }

  if (button.dataset.action === "edit-expense") {
    fillExpenseForm(selectedExpense);
    return;
  }

  if (button.dataset.action === "delete-expense") {
    const confirmed = window.confirm(`Delete ${selectedExpense.expenseName || "this expense"}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    await deleteDoc(doc(db, "expenses", selectedExpense.id));
    if (expenseId.value === selectedExpense.id) {
      resetExpenseForm();
    }
  }
});

billsTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const selectedBill = recurringBills.find((bill) => bill.id === button.dataset.id);
  if (!selectedBill) {
    return;
  }

  if (button.dataset.action === "edit-bill") {
    fillBillForm(selectedBill);
    return;
  }

  if (button.dataset.action === "delete-bill") {
    const confirmed = window.confirm(`Delete ${selectedBill.billType || "this bill"}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    await deleteDoc(doc(db, "recurringBills", selectedBill.id));
    if (billId.value === selectedBill.id) {
      resetBillForm();
    }
  }
});

showRepairFormButton.addEventListener("click", () => {
  resetForm({ hide: false });
  showForm();
});
cancelEditButton.addEventListener("click", resetForm);
repairSearch.addEventListener("input", renderRepairs);
showStockFormButton.addEventListener("click", () => {
  resetStockForm({ hide: false });
  showStockForm();
});
cancelStockEditButton.addEventListener("click", resetStockForm);
stockSearch.addEventListener("input", renderStocks);
showExpenseFormButton.addEventListener("click", () => {
  resetExpenseForm({ hide: false });
  showExpenseForm();
});
cancelExpenseEditButton.addEventListener("click", resetExpenseForm);
expenseSearch.addEventListener("input", renderExpenses);
showBillFormButton.addEventListener("click", () => {
  resetBillForm({ hide: false });
  showBillForm();
});
cancelBillEditButton.addEventListener("click", resetBillForm);
billSearch.addEventListener("input", renderBills);
customerSearch.addEventListener("input", renderCustomers);
reportPeriod.addEventListener("change", renderReports);
customersTableBody.addEventListener("click", (event) => {
  const button = event.target.closest('button[data-action="view-customer-repairs"]');
  if (!button) {
    return;
  }

  repairSearch.value = button.dataset.search || "";
  renderRepairs();
  document.querySelector('.tab-button[data-tab="repairs"]').click();
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-jump-tab]");
  if (!button) {
    return;
  }

  document.querySelector(`.tab-button[data-tab="${button.dataset.jumpTab}"]`)?.click();
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    listenForRepairs();
    listenForStocks();
    listenForExpenses();
    listenForRecurringBills();
    return;
  }

  repairs = [];
  stocks = [];
  expenses = [];
  recurringBills = [];
  resetForm();
  resetStockForm();
  resetExpenseForm();
  resetBillForm();
  renderStocks();
  renderExpenses();
  renderBills();
  renderCustomers();
  renderDashboard();
  renderReports();
  if (unsubscribeRepairs) {
    unsubscribeRepairs();
    unsubscribeRepairs = null;
  }
  if (unsubscribeStocks) {
    unsubscribeStocks();
    unsubscribeStocks = null;
  }
  if (unsubscribeExpenses) {
    unsubscribeExpenses();
    unsubscribeExpenses = null;
  }
  if (unsubscribeRecurringBills) {
    unsubscribeRecurringBills();
    unsubscribeRecurringBills = null;
  }
});
