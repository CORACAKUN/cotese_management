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

let repairs = [];
let unsubscribeRepairs = null;
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

showRepairFormButton.addEventListener("click", () => {
  resetForm({ hide: false });
  showForm();
});
cancelEditButton.addEventListener("click", resetForm);
repairSearch.addEventListener("input", renderRepairs);
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
    return;
  }

  repairs = [];
  resetForm();
  renderCustomers();
  renderDashboard();
  renderReports();
  if (unsubscribeRepairs) {
    unsubscribeRepairs();
    unsubscribeRepairs = null;
  }
});
