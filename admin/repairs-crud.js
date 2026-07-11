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
    },
    (error) => {
      repairsTableBody.innerHTML = `
        <tr>
          <td colspan="7">Unable to load repairs: ${escapeHtml(error.message)}</td>
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

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    listenForRepairs();
    return;
  }

  repairs = [];
  resetForm();
  if (unsubscribeRepairs) {
    unsubscribeRepairs();
    unsubscribeRepairs = null;
  }
});
