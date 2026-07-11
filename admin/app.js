import { auth } from "../config/firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const authScreen = document.getElementById("authScreen");
const adminShell = document.getElementById("adminShell");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const authMessage = document.getElementById("authMessage");
const logoutButton = document.getElementById("logoutButton");
const navToggle = document.getElementById("navToggle");
const userEmail = document.getElementById("userEmail");
const pageTitle = document.getElementById("pageTitle");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

const titles = {
  dashboard: "Dashboard",
  repairs: "Repairs",
  customers: "Customers",
  reports: "Reports"
};

function showLogin() {
  authScreen.classList.remove("hidden");
  adminShell.classList.add("hidden");
}

function showDashboard(user) {
  userEmail.textContent = user.email || "Admin";
  authScreen.classList.add("hidden");
  adminShell.classList.remove("hidden");
}

function getAuthErrorMessage(error) {
  const messages = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Try again later."
  };

  return messages[error.code] || "Unable to sign in. Check the account and password.";
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showDashboard(user);
    return;
  }

  showLogin();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  const formData = new FormData(loginForm);
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    authMessage.textContent = getAuthErrorMessage(error);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

navToggle.addEventListener("click", () => {
  const isOpen = adminShell.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextTab = button.dataset.tab;

    tabButtons.forEach((tab) => {
      const active = tab.dataset.tab === nextTab;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === nextTab);
    });

    pageTitle.textContent = titles[nextTab];
    adminShell.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});
