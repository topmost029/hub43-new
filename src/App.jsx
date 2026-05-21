import React, { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── BRAND COLORS (from Hub43 logo: red, blue, orange/amber) ───────────────
const BRAND = {
  red: "#C8372D",
  blue: "#1E3A8A",
  orange: "#E07B2A",
  darkBlue: "#152C6B",
  lightBlue: "#EEF2FF",
  lightOrange: "#FFF4EA",
  lightRed: "#FFF0EF",
};

// ─── EMAIL INTEGRATION (ZeptoMail via Vercel serverless) ────────────────────
// Emails are sent via the Vercel serverless function at /api/send-email.
// That function calls ZeptoMail from the server side — no CORS issues,
// and the ZeptoMail token stays safely in Vercel environment variables.
//
// Setup: deploy api/send-email.js to Vercel and set these env vars:
//   ZEPTO_TOKEN         — your ZeptoMail Send Mail Token
//   ZEPTO_FROM_ADDRESS  — verified sender email (e.g. work@hub43.ng)
//   ZEPTO_FROM_NAME     — sender display name (e.g. Hub43 Workspace)

const SEND_EMAIL_URL = "/api/send-email";

const sendZeptoMail = async ({ templateParams }) => {
  const { to_email, to_name = "", subject = "Hub43 Message", message = "" } = templateParams || {};

  if (!to_email) return { ok: false, error: "No recipient" };

  const htmlbody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#222;max-width:560px"><pre style="white-space:pre-wrap;font-family:inherit;">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="font-size:11px;color:#9CA3AF">Hub43 Workspace · work@hub43.ng</p></div>`;

  try {
    const res = await fetch(SEND_EMAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email, to_name, subject, htmlbody, textbody: message }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("send-email API error", res.status, err);
      window.open(`mailto:${to_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`, "_blank");
      return { ok: false, fallback: true, error: err?.error };
    }

    return { ok: true };
  } catch (err) {
    console.error("sendZeptoMail error:", err);
    window.open(`mailto:${to_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`, "_blank");
    return { ok: false, fallback: true };
  }
};

// Alias — keeps all existing call sites working without any other changes
const sendEmailJS = ({ templateParams }) => sendZeptoMail({ templateParams });

// Build email template params for common Hub43 events
const buildEmailParams = {
  bookingConfirmation: ({ user, booking, amount, service, plan, details = "" }) => ({
    to_email: user.email,
    to_name: user.name,
    subject: `Hub43 – ${service} Booking Confirmed`,
    message: `Hi ${user.name},\n\nYour ${service} booking has been submitted successfully.\n\nService: ${service}\nPlan: ${plan}\nDate: ${booking.date || new Date().toLocaleDateString("en-NG")}\nAmount: ₦${Number(amount).toLocaleString("en-NG")}\nStatus: Pending Admin Approval${details ? "\n\n" + details : ""}\n\nYou will receive another email once your booking is approved.\n\nWarm regards,\nHub43 Workspace Team\nwork@hub43.com | +234-800-HUB-43HQ`,
    service_label: service,
    plan_label: plan,
    amount: "₦" + Number(amount).toLocaleString("en-NG"),
    status: "Pending Approval",
    hub43_note: "You will be notified once your booking is approved.",
  }),

  bookingApproved: ({ user, booking, wifiSsid, wifiPassword }) => ({
    to_email: user.email,
    to_name: user.name,
    subject: `Hub43 – Your Booking is Approved! 🎉`,
    message: `Hi ${user.name},\n\nGreat news! Your ${(booking.service || "").replace(/_/g," ")} booking has been approved.\n\nDate: ${booking.date}\nWiFi Network: ${wifiSsid || "Hub43-Workspace-5G"}\nWiFi Password: ${wifiPassword || "—"}\n\nPlease do not share the WiFi password with anyone outside Hub43.\n\nSee you at the workspace!\n\nHub43 Workspace Team\nwork@hub43.com | +234-800-HUB-43HQ`,
    service_label: (booking.service || "").replace(/_/g," "),
    wifi_ssid: wifiSsid || "",
    wifi_password: wifiPassword || "",
    status: "Approved",
  }),

  subscriptionActivated: ({ user, sub, officeName = "" }) => ({
    to_email: user.email,
    to_name: user.name,
    subject: `Hub43 – ${sub.service.replace(/_/g," ")} Subscription Active`,
    message: `Hi ${user.name},\n\nYour Hub43 subscription is now active!\n\nService: ${sub.service.replace(/_/g," ")}\nPlan: ${sub.plan}\nStart: ${sub.startDate}\nExpires: ${sub.endDate}${officeName ? "\nOffice: " + officeName : ""}\nAmount: ₦${Number(sub.amount).toLocaleString("en-NG")}\n\nLog in to your Hub43 portal to view your subscription details.\n\nWarm regards,\nHub43 Workspace Team\nwork@hub43.com | +234-800-HUB-43HQ`,
    service_label: sub.service.replace(/_/g," "),
    plan_label: sub.plan,
    expiry_date: sub.endDate,
    amount: "₦" + Number(sub.amount).toLocaleString("en-NG"),
    office_name: officeName,
  }),

  subscriptionRenewed: ({ user, sub }) => ({
    to_email: user.email,
    to_name: user.name,
    subject: `Hub43 – Subscription Renewed ✅`,
    message: `Hi ${user.name},\n\nYour Hub43 ${sub.service.replace(/_/g," ")} subscription has been renewed.\n\nNew Expiry: ${sub.endDate}\nPlan: ${sub.plan}\nAmount: ₦${Number(sub.amount).toLocaleString("en-NG")}\n\nThank you for staying with Hub43!\n\nHub43 Workspace Team\nwork@hub43.com | +234-800-HUB-43HQ`,
    expiry_date: sub.endDate,
    plan_label: sub.plan,
    amount: "₦" + Number(sub.amount).toLocaleString("en-NG"),
  }),

  expiryReminder: ({ user, sub, daysLeft }) => ({
    to_email: user.email,
    to_name: user.name,
    subject: `Hub43 – Subscription Expiring in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""}`,
    message: `Hi ${user.name},\n\nThis is a reminder that your Hub43 ${sub.service.replace(/_/g," ")} subscription is expiring in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} (${sub.endDate}).\n\nLog in to renew now to avoid interruption.\n\nHub43 Workspace Team\nwork@hub43.com | +234-800-HUB-43HQ`,
    service_label: sub.service.replace(/_/g," "),
    days_left: String(daysLeft),
    expiry_date: sub.endDate,
  }),

  weeklyExpenseReport: ({ managerEmail, weekLabel, total, entries, reportBody }) => ({
    to_email: managerEmail,
    to_name: "Manager",
    subject: `Hub43 Weekly Expense Report – ${weekLabel}`,
    message: reportBody,
    week_label: weekLabel,
    total_amount: "₦" + Number(total).toLocaleString("en-NG"),
    entry_count: String(entries),
  }),

  frontDeskWelcome: ({ user, password }) => ({
    to_email: user.email,
    to_name: user.name,
    subject: `Hub43 – Your Front Desk Account is Ready 🎉`,
    message: `Hi ${user.name},\n\nYour Hub43 Front Desk account has been created by the admin.\n\nLogin Details:\nEmail: ${user.email}\nPassword: ${password}\n\nYou can log in at the Hub43 portal. Please change your password after your first login.\n\nWarm regards,\nHub43 Workspace Team\nwork@hub43.com | +234-800-HUB-43HQ`,
    login_email: user.email,
    temp_password: password,
    portal_url: "https://hub43workspace.com/portal",
  }),

  invoiceSent: ({ user, inv }) => ({
    to_email: user.email,
    to_name: user.name,
    subject: `Hub43 – Invoice #${inv.id.toUpperCase()} (${inv.status === "paid" ? "PAID" : "PENDING"})`,
    message: `Hi ${user.name},\n\nPlease find your invoice details below.\n\nInvoice: #${inv.id.toUpperCase()}\nService: ${inv.service}\nDescription: ${inv.description}\nDate: ${inv.date}\nAmount: ₦${Number(inv.amount).toLocaleString("en-NG")}\nStatus: ${inv.status.toUpperCase()}\n\nYou can download your invoice from the Hub43 portal.\n\nHub43 Workspace Team\nwork@hub43.com | +234-800-HUB-43HQ`,
    invoice_id: inv.id.toUpperCase(),
    service_label: inv.service,
    amount: "₦" + Number(inv.amount).toLocaleString("en-NG"),
    status: inv.status.toUpperCase(),
  }),
};

// ─── PAYSTACK CHECKOUT HELPER ────────────────────────────────────────────────
let _paystackPromise = null;
const loadPaystack = () => {
  if (_paystackPromise) return _paystackPromise;
  _paystackPromise = new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(window.PaystackPop); return; }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    const timer = setTimeout(() => reject(new Error("timeout")), 15000);
    script.onload  = () => { clearTimeout(timer); resolve(window.PaystackPop); };
    script.onerror = () => { clearTimeout(timer); _paystackPromise = null; reject(new Error("load_failed")); };
    document.head.appendChild(script);
  });
  return _paystackPromise;
};

const openPaystackCheckout = ({ key, email, amount, name, onOpen, onSuccess, onClose }) => {
  if (!key || key.startsWith("pk_test_xxx") || (!key.startsWith("pk_test_") && !key.startsWith("pk_live_"))) {
    alert("Paystack is not configured.\n\nGo to Admin > Settings > Payment Settings and paste a valid Paystack public key.");
    if (onClose) onClose();
    return;
  }
  loadPaystack().then((PaystackPop) => {
    if (onOpen) onOpen();
    try {
      const handler = PaystackPop.setup({
        key, email, amount: amount * 100, currency: "NGN", name,
        callback: (res) => onSuccess(res.reference),
        onClose,
      });
      handler.openIframe();
    } catch (err) {
      console.error("Paystack setup error:", err);
      alert("Could not open Paystack checkout. Please try again or use Bank Transfer.");
      if (onClose) onClose();
    }
  }).catch((err) => {
    const msg = err.message === "timeout"
      ? "Paystack is taking too long to load. Check your internet and try again."
      : "Could not load Paystack. Check your connection or use Bank Transfer instead.";
    alert(msg);
    if (onClose) onClose();
  });
};

const INITIAL_PLANS = {
  virtual_office: [
    { id: "biannual", label: "Bi-Annual (6 months)", days: 180, price: 75000 },
    { id: "annual", label: "Annual (12 months)", days: 365, price: 120000 },
  ],
};

// Days per private office plan tier
const OFFICE_PLAN_DAYS = { daily: 1, monthly: 30, quarterly: 90, yearly: 365 };

const INITIAL_HOT_DESK_PRICING = { hourly: 625, daily: 4000, monthly: 60000 };

// ─── MOCK DATA ──────────────────────────────────────────────────────────────
const INITIAL_DATA = {
  plans: INITIAL_PLANS,
  hotDeskPricing: INITIAL_HOT_DESK_PRICING,
  users: [
    { id: "u1", name: "Admin User", email: "admin@hub43.com", role: "admin", phone: "+234-801-000-0001", joined: "2024-01-01" },
    { id: "u5", name: "Temi Balogun", email: "frontdesk@hub43.com", role: "frontdesk", phone: "+234-805-777-8888", joined: "2024-02-01" },
    { id: "u2", name: "Chidi Okafor", email: "chidi@example.com", role: "member", phone: "+234-802-111-2222", joined: "2024-03-15" },
    { id: "u3", name: "Ngozi Adeyemi", email: "ngozi@example.com", role: "member", phone: "+234-803-333-4444", joined: "2024-05-20" },
    { id: "u4", name: "Emeka Nwosu", email: "emeka@example.com", role: "member", phone: "+234-804-555-6666", joined: "2024-07-10" },
  ],
  offices: [
    { id: "o1", name: "Office A", floor: "2nd Floor", capacity: 4, status: "occupied", assignedTo: "u2", type: "private", pricing: { daily: 7500, monthly: 150000, quarterly: 380000, yearly: 1200000 } },
    { id: "o2", name: "Office B", floor: "2nd Floor", capacity: 2, status: "available", assignedTo: null, type: "private", pricing: { daily: 5000, monthly: 100000, quarterly: 270000, yearly: 900000 } },
    { id: "o3", name: "Office C", floor: "3rd Floor", capacity: 6, status: "available", assignedTo: null, type: "private", pricing: { daily: 12000, monthly: 220000, quarterly: 580000, yearly: 1800000 } },
    { id: "o4", name: "Office D", floor: "3rd Floor", capacity: 3, status: "occupied", assignedTo: "u3", type: "private", pricing: { daily: 6000, monthly: 120000, quarterly: 320000, yearly: 1050000 } },
  ],
  meetingRooms: [
    { id: "mr1", name: "The Boardroom", capacity: 12, floor: "2nd Floor", pricing: { hourly: 15000, halfDay: 55000, fullDay: 100000 } },
  ],
  subscriptions: [
    { id: "s1", userId: "u2", service: "private_office", plan: "monthly", startDate: "2026-04-15", endDate: "2026-05-15", status: "active", officeId: "o1", amount: 150000 },
    { id: "s2", userId: "u3", service: "private_office", plan: "quarterly", startDate: "2026-03-01", endDate: "2026-05-30", status: "active", officeId: "o4", amount: 380000 },
    { id: "s3", userId: "u4", service: "virtual_office", plan: "annual", startDate: "2026-01-01", endDate: "2027-01-01", status: "active", amount: 120000 },
  ],
  bookings: [
    { id: "b1", userId: "u2", service: "hot_desk", date: "2026-05-14", checkIn: "09:00", checkOut: "17:00", hours: 8, amount: 5000, status: "completed", invoiceId: "inv1" },
    { id: "b2", userId: "u3", service: "meeting_room", roomId: "mr1", date: "2026-05-14", startTime: "10:00", endTime: "12:00", hours: 2, amount: 30000, status: "approved", invoiceId: "inv2" },
    { id: "b3", userId: "u4", service: "meeting_room", roomId: "mr1", date: "2026-05-15", startTime: "14:00", endTime: "16:00", hours: 2, amount: 16000, status: "pending", invoiceId: null },
  ],
  invoices: [
    { id: "inv1", userId: "u2", bookingId: "b1", amount: 5000, date: "2026-05-14", status: "paid", service: "Hot Desk", description: "Hot Desk - 8 hours" },
    { id: "inv2", userId: "u3", bookingId: "b2", amount: 30000, date: "2026-05-14", status: "paid", service: "Meeting Room", description: "The Boardroom - 2 hours" },
  ],
  notifications: [
    { id: "n1", userId: "u2", type: "reminder", message: "Your Office A subscription expires in 7 days. Renew now to avoid interruption.", read: false, date: "2026-05-08" },
    { id: "n2", userId: "u3", type: "reminder", message: "Your Office D subscription expires in 15 days.", read: true, date: "2026-05-01" },
    { id: "n3", userId: "u4", type: "info", message: "Welcome to Hub43 Virtual Office! Your subscription is now active.", read: true, date: "2026-01-01" },
  ],
  // Expenses
  expenses: [
    { id: "exp1",  date: "2026-04-01", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-01T07:30:00" },
    { id: "exp2",  date: "2026-04-01", category: "Utilities",     description: "Power unit",                          amount: 5100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-01T08:00:00" },
    { id: "exp3",  date: "2026-04-01", category: "Utilities",     description: "Power unit",                          amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-01T09:00:00" },
    { id: "exp4",  date: "2026-04-02", category: "Utilities",     description: "Power unit",                          amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-02T08:30:00" },
    { id: "exp5",  date: "2026-04-02", category: "Refreshments",  description: "CWAY x2",                             amount: 3300,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-02T10:00:00" },
    { id: "exp6",  date: "2026-04-07", category: "Utilities",     description: "Power unit",                          amount: 15200, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-07T08:15:00" },
    { id: "exp7",  date: "2026-04-07", category: "Fuel",          description: "Diesel",                              amount: 20000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-07T09:00:00" },
    { id: "exp8",  date: "2026-04-08", category: "Utilities",     description: "Power unit",                          amount: 15200, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-08T08:00:00" },
    { id: "exp9",  date: "2026-04-08", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-08T09:00:00" },
    { id: "exp10", date: "2026-04-08", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-08T11:00:00" },
    { id: "exp11", date: "2026-04-09", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-09T07:45:00" },
    { id: "exp12", date: "2026-04-09", category: "Utilities",     description: "Power unit",                          amount: 5100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-09T08:30:00" },
    { id: "exp13", date: "2026-04-09", category: "Maintenance",   description: "Battery Rent",                        amount: 4000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-09T09:00:00" },
    { id: "exp14", date: "2026-04-09", category: "Refreshments",  description: "CWAY Cup x3",                         amount: 2100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-09T10:00:00" },
    { id: "exp15", date: "2026-04-10", category: "Utilities",     description: "Power unit",                          amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-10T08:00:00" },
    { id: "exp16", date: "2026-04-10", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-10T09:00:00" },
    { id: "exp17", date: "2026-04-10", category: "Fuel",          description: "Diesel",                              amount: 5000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-10T11:30:00" },
    { id: "exp18", date: "2026-04-13", category: "Utilities",     description: "Power unit",                          amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-13T08:00:00" },
    { id: "exp19", date: "2026-04-13", category: "Fuel",          description: "Diesel",                              amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-13T08:45:00" },
    { id: "exp20", date: "2026-04-13", category: "Utilities",     description: "Power unit",                          amount: 5000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-13T09:30:00" },
    { id: "exp21", date: "2026-04-13", category: "Maintenance",   description: "Battery Rent",                        amount: 4000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-13T10:00:00" },
    { id: "exp22", date: "2026-04-13", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-13T11:00:00" },
    { id: "exp23", date: "2026-04-13", category: "Cleaning",      description: "Soap",                                amount: 900,   paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-13T12:00:00" },
    { id: "exp24", date: "2026-04-14", category: "Refreshments",  description: "CWAY x1",                             amount: 1650,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-14T08:00:00" },
    { id: "exp25", date: "2026-04-14", category: "Utilities",     description: "Power unit",                          amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-14T08:30:00" },
    { id: "exp26", date: "2026-04-14", category: "Fuel",          description: "Diesel",                              amount: 20000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-14T09:00:00" },
    { id: "exp27", date: "2026-04-14", category: "Utilities",     description: "Power unit",                          amount: 5100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-14T10:00:00" },
    { id: "exp28", date: "2026-04-15", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-15T07:30:00" },
    { id: "exp29", date: "2026-04-15", category: "Utilities",     description: "Power unit",                          amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-15T08:30:00" },
    { id: "exp30", date: "2026-04-15", category: "Maintenance",   description: "Gen Services",                        amount: 5000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-15T10:00:00" },
    { id: "exp31", date: "2026-04-16", category: "Refreshments",  description: "CWAY x1",                             amount: 1650,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-16T08:00:00" },
    { id: "exp32", date: "2026-04-16", category: "Fuel",          description: "Diesel",                              amount: 10000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-16T09:00:00" },
    { id: "exp33", date: "2026-04-17", category: "Fuel",          description: "Diesel",                              amount: 10000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-17T08:00:00" },
    { id: "exp34", date: "2026-04-17", category: "Utilities",     description: "Power unit",                          amount: 10000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-17T09:00:00" },
    { id: "exp35", date: "2026-04-18", category: "Fuel",          description: "Diesel",                              amount: 5000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-18T08:30:00" },
    { id: "exp36", date: "2026-04-20", category: "Refreshments",  description: "CWAY x1",                             amount: 1650,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-20T08:00:00" },
    { id: "exp37", date: "2026-04-20", category: "Utilities",     description: "Power unit",                          amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-20T08:30:00" },
    { id: "exp38", date: "2026-04-20", category: "Utilities",     description: "Power unit",                          amount: 5100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-20T09:30:00" },
    { id: "exp39", date: "2026-04-21", category: "Utilities",     description: "Power unit",                          amount: 10100, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-21T08:00:00" },
    { id: "exp40", date: "2026-04-21", category: "Fuel",          description: "Diesel",                              amount: 10000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-21T09:00:00" },
    { id: "exp41", date: "2026-04-22", category: "Fuel",          description: "Diesel",                              amount: 20000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-22T08:00:00" },
    { id: "exp42", date: "2026-04-22", category: "Utilities",     description: "Power unit",                          amount: 15200, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-22T08:30:00" },
    { id: "exp43", date: "2026-04-22", category: "Maintenance",   description: "Gen Pumping",                         amount: 45000, paymentMethod: "card", recordedBy: "u1", enteredAt: "2026-04-22T10:00:00" },
    { id: "exp44", date: "2026-04-23", category: "Refreshments",  description: "CWAY x1",                             amount: 1650,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-23T08:00:00" },
    { id: "exp45", date: "2026-04-23", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-23T09:00:00" },
    { id: "exp46", date: "2026-04-23", category: "Maintenance",   description: "Battery Rent",                        amount: 4100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-23T10:00:00" },
    { id: "exp47", date: "2026-04-24", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-24T08:00:00" },
    { id: "exp48", date: "2026-04-24", category: "Utilities",     description: "Power unit",                          amount: 10200, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-24T09:00:00" },
    { id: "exp49", date: "2026-04-27", category: "Utilities",     description: "Power unit",                          amount: 5000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-27T08:00:00" },
    { id: "exp50", date: "2026-04-27", category: "Fuel",          description: "Diesel",                              amount: 15000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-27T08:30:00" },
    { id: "exp51", date: "2026-04-27", category: "Maintenance",   description: "Battery Rent",                        amount: 4000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-27T09:00:00" },
    { id: "exp52", date: "2026-04-27", category: "Maintenance",   description: "Key Start",                           amount: 3000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-27T09:30:00" },
    { id: "exp53", date: "2026-04-27", category: "Maintenance",   description: "Generator Workshop Bal PUMPREPAIR",   amount: 10000, paymentMethod: "card", recordedBy: "u1", enteredAt: "2026-04-27T10:00:00" },
    { id: "exp54", date: "2026-04-27", category: "Maintenance",   description: "Oil x2 (Outstanding)",                amount: 28000, paymentMethod: "card", recordedBy: "u1", enteredAt: "2026-04-27T11:00:00" },
    { id: "exp55", date: "2026-04-28", category: "Utilities",     description: "Power unit",                          amount: 5000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-28T07:30:00" },
    { id: "exp56", date: "2026-04-28", category: "Utilities",     description: "Power unit",                          amount: 20300, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-28T08:30:00" },
    { id: "exp57", date: "2026-04-28", category: "Fuel",          description: "Diesel",                              amount: 58500, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-28T09:00:00" },
    { id: "exp58", date: "2026-04-28", category: "Refreshments",  description: "Cway x2",                             amount: 3600,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-28T10:00:00" },
    { id: "exp59", date: "2026-04-29", category: "Fuel",          description: "Diesel",                              amount: 20000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-29T08:00:00" },
    { id: "exp60", date: "2026-04-29", category: "Maintenance",   description: "Battery Rent",                        amount: 4100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-29T09:00:00" },
    { id: "exp61", date: "2026-04-30", category: "Fuel",          description: "Diesel",                              amount: 20000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-30T07:30:00" },
    { id: "exp62", date: "2026-04-30", category: "Fuel",          description: "Diesel",                              amount: 10000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-30T08:30:00" },
    { id: "exp63", date: "2026-04-30", category: "Fuel",          description: "Diesel",                              amount: 30000, paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-30T09:00:00" },
    { id: "exp64", date: "2026-04-30", category: "Maintenance",   description: "Battery Rent",                        amount: 4100,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-30T10:00:00" },
    { id: "exp65", date: "2026-04-30", category: "Signage",       description: "Signage x10",                         amount: 7000,  paymentMethod: "card", recordedBy: "u1", enteredAt: "2026-04-30T11:00:00" },
    { id: "exp66", date: "2026-04-30", category: "Maintenance",   description: "Battery Rent",                        amount: 3000,  paymentMethod: "card", recordedBy: "u5", enteredAt: "2026-04-30T12:00:00" },
  ],
  managerEmail: "manager@hub43.com",
  // ZeptoMail configuration — admin can update from Email Settings panel
  emailSettings: {
    sendMailToken: "",          // ZeptoMail Send Mail Token (from Mail Agent settings)
    fromAddress: "",            // Verified sender address e.g. "noreply@hub43.com"
    fromName: "Hub43 Workspace", // Display name for outgoing emails
    enableBookingConfirmation: true,
    enableBookingApproval: true,
    enableSubscriptionActivated: true,
    enableSubscriptionRenewed: true,
    enableExpiryReminder: true,
    enableInvoiceEmail: true,
    emailLog: [],               // [{ id, type, to, subject, status, timestamp }]
  },
  // Password store — keyed by userId. Admin sets passwords for front desk staff.
  userPasswords: {
    u1: "admin123",        // Admin
    u5: "frontdesk123",   // Default front desk password
  },
  // WiFi credentials shown to approved hot desk members
  wifi: { ssid: "Hub43-Workspace-5G", password: "Hub43@2025!" },
  // Payment methods — admin can toggle each on/off
  paymentMethods: {
    bankTransfer: true,
    paystack: true,
    paystackKey: "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    bankDetails: {
      bankName: "Guaranty Trust Bank (GTB)",
      accountNumber: "0123456789",
      accountName: "Hub43 Workspace Ltd",
    },
  },
  // virtualDocs: per-user Certificate of Registration uploads + global utility bill
  virtualDocs: {
    certificates: {}, // { userId: { fileName, uploadedAt, dataUrl } }
    utilityBill: null, // { fileName, uploadedAt, dataUrl } — shared for all users
    utilityRequests: [], // [{ id, userId, requestedAt, status: "pending"|"fulfilled" }]
  },
};

const formatNGN = (n) => "₦" + Number(n).toLocaleString("en-NG");
const formatDate = (d) => new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
const daysLeft = (endDate) => Math.max(0, Math.ceil((new Date(endDate) - new Date()) / 86400000));

// ─── ICONS ──────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18, color }) => {
  const icons = {
    desk: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="14" width="20" height="3" rx="1"/><path d="M6 14V8M18 14V8"/><rect x="4" y="6" width="16" height="2" rx="1"/></svg>,
    office: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><rect x="9" y="10" width="2" height="2"/><rect x="13" y="10" width="2" height="2"/></svg>,
    meeting: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    virtual: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    dashboard: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    users: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    bell: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    invoice: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    logout: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    x: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    wifi: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
    chart: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
    calendar: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    star: <svg width={size} height={size} viewBox="0 0 24 24" fill={color||"currentColor"} stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    wallet: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>,
    send: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    filter: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    trash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
    mail: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  };
  return icons[name] || null;
};

// ─── BADGE ──────────────────────────────────────────────────────────────────
const Badge = ({ status }) => {
  const map = {
    active: { bg: "#DCFCE7", color: "#166534", label: "Active" },
    expired: { bg: "#FEE2E2", color: "#991B1B", label: "Expired" },
    pending: { bg: "#FEF9C3", color: "#854D0E", label: "Pending" },
    pending_transfer: { bg: "#FFF4EA", color: "#92400E", label: "Awaiting Payment" },
    approved: { bg: "#DCFCE7", color: "#166534", label: "Approved" },
    rejected: { bg: "#FEE2E2", color: "#991B1B", label: "Rejected" },
    completed: { bg: "#EDE9FE", color: "#5B21B6", label: "Completed" },
    available: { bg: "#DCFCE7", color: "#166534", label: "Available" },
    occupied: { bg: "#FEE2E2", color: "#991B1B", label: "Occupied" },
    paid: { bg: "#DCFCE7", color: "#166534", label: "Paid" },
    unpaid: { bg: "#FEE2E2", color: "#991B1B", label: "Unpaid" },
  };
  const s = map[status] || { bg: "#F3F4F6", color: "#374151", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {s.label}
    </span>
  );
};

// ─── MODAL ──────────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children, width = 500 }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: BRAND.blue }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6B7280" }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </div>
  );
};

// ─── STAT CARD ──────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color, icon }) => (
  <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon name={icon} size={22} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
    </div>
  </div>
);

// ─── TOP NAV ─────────────────────────────────────────────────────────────────
const TopNav = ({ user, notifications, onNotifClick, onLogout, sideOpen, setSideOpen }) => {
  const unread = notifications.filter(n => n.userId === user.id && !n.read).length;
  return (
    <header style={{ height: 60, background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setSideOpen(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "#6B7280", display: "flex" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, background: BRAND.blue, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>H</span>
          </div>
          <span style={{ fontWeight: 800, color: BRAND.blue, fontSize: 15 }}>Hub<span style={{ color: BRAND.orange }}>43</span></span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onNotifClick} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 6, color: "#6B7280" }}>
          <Icon name="bell" size={20} />
          {unread > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, background: BRAND.red, borderRadius: 7, fontSize: 9, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{unread}</span>}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 34, height: 34, background: BRAND.orange + "22", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: BRAND.orange, fontWeight: 700, fontSize: 13 }}>{user.name[0]}</span>
          </div>
          <div style={{ lineHeight: 1.2, display: "none" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>{user.role}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "#9CA3AF" }}>
          <Icon name="logout" size={18} />
        </button>
      </div>
    </header>
  );
};

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const Sidebar = ({ user, active, setActive, open, data }) => {
  const adminNav = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard" },
    { key: "users", label: "Members", icon: "users" },
    { key: "offices", label: "Offices", icon: "office" },
    { key: "meeting_rooms", label: "Meeting Rooms", icon: "meeting" },
    { key: "bookings", label: "All Bookings", icon: "calendar" },
    { key: "virtual_offices", label: "Virtual Offices", icon: "virtual" },
    { key: "subscriptions", label: "Subscriptions", icon: "star" },
    { key: "invoices", label: "Invoices", icon: "invoice" },
    { key: "revenue", label: "Revenue", icon: "chart" },
    { key: "pricing", label: "Pricing", icon: "invoice" },
    { key: "pending_payments", label: "Pending Payments", icon: "wallet" },
    { key: "onboarding_report", label: "Onboarding Report", icon: "users" },
    { key: "export", label: "Export Data", icon: "download" },
    { key: "wifi_settings", label: "WiFi Settings", icon: "wifi" },
    { key: "payment_settings", label: "Payment Settings", icon: "invoice" },
    { key: "email_settings", label: "Email Settings", icon: "mail" },
    { key: "expenses", label: "Expenses", icon: "wallet" },
  ];
  const memberNav = (() => {
    const base = [
      { key: "dashboard", label: "My Dashboard", icon: "dashboard" },
    ];
    const servicePages = [
      { key: "hot_desk",       label: "Hot Desk",        icon: "desk",    svcId: "hot_desk"       },
      { key: "private_office", label: "Private Office",  icon: "office",  svcId: "private_office" },
      { key: "meeting_room",   label: "Meeting Rooms",   icon: "meeting", svcId: "meeting_room"   },
      { key: "virtual_office", label: "Virtual Office",  icon: "virtual", svcId: "virtual_office" },
    ];
    if (user && user.role === "member" && data) {
      // Get all services the member has ever subscribed to (active or otherwise, to allow re-booking)
      const userSubs = (data.subscriptions || []).filter(s => s.userId === user.id && s.status === "active");
      const subscribedServices = userSubs.map(s => s.service);
      // Complimentary virtual office utility bill access for monthly+ private_office / hot_desk subscribers
      const hasComplimentaryVO = !subscribedServices.includes("virtual_office") && userSubs.some(s =>
        (s.service === "private_office" || s.service === "hot_desk") &&
        ["monthly", "quarterly", "yearly"].includes(s.plan)
      );
      servicePages.forEach(sp => {
        if (subscribedServices.includes(sp.svcId)) {
          base.push({ key: sp.key, label: sp.label, icon: sp.icon });
        } else if (sp.svcId === "virtual_office" && hasComplimentaryVO) {
          // Show Virtual Office in sidebar with a perk label
          base.push({ key: sp.key, label: "Virtual Office ✦", icon: sp.icon });
        }
      });
      // Add "Upgrade / Add Service" option if they don't have all services
      const allSvcIds = servicePages.map(s => s.svcId);
      const missingServices = allSvcIds.filter(id => !subscribedServices.includes(id));
      if (missingServices.length > 0) {
        base.push({ key: "add_service", label: "+ Add Service", icon: "plus" });
      }
    } else if (!data) {
      servicePages.forEach(sp => base.push({ key: sp.key, label: sp.label, icon: sp.icon }));
    }
    base.push(
      { key: "my_bookings",   label: "My Bookings",   icon: "calendar" },
      { key: "subscriptions", label: "Subscriptions", icon: "star"     },
      { key: "my_invoices",   label: "Invoices",      icon: "invoice"  },
      { key: "my_profile",    label: "My Profile",    icon: "users"    },
    );
    return base;
  })();
  const frontdeskNav = [
    { key: "fd_onboard", label: "Quick Onboard", icon: "plus" },
    { key: "fd_checkins", label: "Today's Check-ins", icon: "calendar" },
    { key: "fd_members", label: "All Members", icon: "users" },
    { key: "expenses", label: "Expenses", icon: "wallet" },
    { key: "fd_account", label: "My Account", icon: "users" },
  ];
  const nav = user.role === "admin" ? adminNav : user.role === "frontdesk" ? frontdeskNav : memberNav;
  const panelLabel = user.role === "admin" ? "Admin Panel" : user.role === "frontdesk" ? "Front Desk" : "Member Portal";

  // Count unconfirmed bank-transfer subs for badge
  const pendingPaymentCount = user.role === "admin"
    ? (data?.subscriptions || []).filter(s => s.status === "pending_transfer").length
    : 0;

  return (
    <aside style={{ width: open ? 220 : 0, minWidth: open ? 220 : 0, background: BRAND.blue, transition: "all .2s", overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "24px 16px 12px" }}>
        <div style={{ fontSize: 11, color: "#93C5FD", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{panelLabel}</div>
        <div style={{ fontSize: 13, color: "#BFDBFE", marginBottom: 4 }}>{user.name}</div>
      </div>
      <nav style={{ flex: 1, padding: "0 8px" }}>
        {nav.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setActive(key)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", cursor: "pointer", borderRadius: 8, marginBottom: 2, background: active === key ? "rgba(255,255,255,0.15)" : "transparent", color: active === key ? "#fff" : "#93C5FD", fontWeight: active === key ? 700 : 400, fontSize: 13, textAlign: "left", transition: "all .15s" }}>
            <Icon name={icon} size={16} color={active === key ? "#fff" : "#93C5FD"} />
            <span style={{ whiteSpace: "nowrap", flex: 1 }}>{label}</span>
            {key === "pending_payments" && pendingPaymentCount > 0 && (
              <span style={{ background: BRAND.orange, color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "1px 6px", flexShrink: 0 }}>{pendingPaymentCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 10, color: "#6B85B0", textAlign: "center" }}>Hub43 Workspace v2.0</div>
        <div style={{ fontSize: 10, color: "#6B85B0", textAlign: "center" }}>Work. Learn. Connect.</div>
      </div>
    </aside>
  );
};

// ─── ONBOARDING SERVICES CATALOG ─────────────────────────────────────────────
const ONBOARDING_SERVICES = [
  {
    id: "hot_desk",
    label: "Hot Desk",
    icon: "desk",
    desc: "Flexible shared workspace. Book by the hour, day, or month.",
    color: BRAND.blue,
    plans: [
      { id: "hourly", label: "Hourly", price: 625, suffix: "/hr", days: 0 },
      { id: "daily",  label: "Daily",  price: 4000, suffix: "/day", days: 1 },
      { id: "monthly",label: "Monthly",price: 60000, suffix: "/mo", days: 30 },
    ],
  },
  {
    id: "private_office",
    label: "Private Office",
    icon: "office",
    desc: "Your own dedicated office space. Full privacy and focus.",
    color: BRAND.orange,
    plans: [
      { id: "daily",     label: "Daily",     price: 5000,   suffix: "/day", days: 1 },
      { id: "monthly",   label: "Monthly",   price: 100000, suffix: "/mo",  days: 30 },
      { id: "quarterly", label: "Quarterly", price: 270000, suffix: "/qtr", days: 90 },
      { id: "yearly",    label: "Yearly",    price: 900000, suffix: "/yr",  days: 365 },
    ],
  },
  {
    id: "meeting_room",
    label: "Meeting Room",
    icon: "meeting",
    desc: "Professional boardroom for presentations, calls, and team meetings.",
    color: "#7C3AED",
    plans: [
      { id: "hourly",  label: "Hourly",   price: 15000, suffix: "/hr",      days: 0 },
      { id: "halfDay", label: "Half Day", price: 55000, suffix: "/half-day",days: 0 },
      { id: "fullDay", label: "Full Day", price: 100000, suffix: "/day",    days: 1 },
    ],
  },
  {
    id: "virtual_office",
    label: "Virtual Office",
    icon: "virtual",
    desc: "Business address, mail handling & registered presence — no desk needed.",
    color: "#059669",
    plans: [
      { id: "biannual", label: "Bi-Annual", price: 75000,  suffix: "/6mo",  days: 180 },
      { id: "annual",   label: "Annual",    price: 120000, suffix: "/yr",   days: 365 },
    ],
  },
];

// ─── ONBOARDING FLOW ──────────────────────────────────────────────────────────
// Steps: register → otp → subscribe → payment → done
const OnboardingFlow = ({ onComplete, allUsers, allPasswords, data, setData, expiredSession = false }) => {
  const [step, setStep] = useState("login"); // login | register | otp | subscribe | payment | done
  // Login state
  const [loginEmail, setLoginEmail] = useState("admin@hub43.com");
  const [loginPassword, setLoginPassword] = useState("admin123");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  // OTP state
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpEmailOk, setOtpEmailOk] = useState(null); // true = sent, false = fallback/failed
  const [newUser, setNewUser] = useState(null);
  // Subscribe state
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedPlans, setSelectedPlans] = useState({});
  const [subscribeError, setSubscribeError] = useState("");
  // Payment state
  const [payMethod, setPayMethod] = useState(null);
  const [payLoading, setPayLoading] = useState(false);
  const [psOpening, setPsOpening] = useState(false);
  const [payError, setPayError] = useState(false);
  // Password reset state
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState(["", "", "", "", "", ""]);
  const [resetGeneratedOtp, setResetGeneratedOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetShowPass, setResetShowPass] = useState(false);

  // ── Login handler
  const handleLogin = () => {
    setLoginLoading(true);
    setTimeout(() => {
      const users = allUsers || INITIAL_DATA.users;
      const found = users.find(u => u.email === loginEmail);
      const passwords = allPasswords || INITIAL_DATA.userPasswords || {};
      const correctPassword = found ? (passwords[found.id] || "admin123") : null;
      if (found && loginPassword === correctPassword) {
        // Check if member needs to subscribe first
        if (found.role === "member") {
          const hasSub = (data.subscriptions || []).some(s => s.userId === found.id && (s.status === "active" || s.status === "pending_transfer"));
          const isPendingPayment = found.pendingSubscription;
          if (!hasSub && !isPendingPayment) {
            setNewUser(found);
            setStep("subscribe");
            return;
          }
        }
        onComplete(found);
      } else {
        setLoginError("Invalid email or password. Please check your credentials.");
        setLoginLoading(false);
      }
    }, 600);
  };

  // ── Register handler: create pending user, generate & email OTP via ZeptoMail
  const handleRegister = async () => {
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) { setRegError("Please fill in all required fields."); return; }
    if (regPassword !== regConfirm) { setRegError("Passwords do not match."); return; }
    if (regPassword.length < 6) { setRegError("Password must be at least 6 characters."); return; }
    const existing = (allUsers || []).find(u => u.email === regEmail.toLowerCase().trim());
    if (existing) { setRegError("An account with this email already exists."); return; }
    setRegLoading(true);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(otp);
    const uid = "u" + Date.now();
    const user = { id: uid, name: regName.trim(), email: regEmail.toLowerCase().trim(), phone: regPhone.trim() || "", role: "member", joined: new Date().toISOString().split("T")[0], pendingOtp: true };
    setNewUser(user);

    // Send OTP via ZeptoMail (falls back to mailto if /api/send-email not reachable)
    const es = data?.emailSettings || {};
    const emailResult = await sendZeptoMail({
      templateParams: {
        to_email: user.email,
        to_name: user.name,
        subject: "Hub43 – Your Verification Code",
        message: `Hi ${user.name},\n\nYour Hub43 verification code is:\n\n${otp}\n\nThis code is valid for 10 minutes. Do not share it with anyone.\n\nIf you did not request this, please ignore this email.\n\nHub43 Workspace Team\nwork@hub43.com`,
      },
    });

    setOtpEmailOk(emailResult.ok);

    setRegLoading(false);
    setOtpSent(true);
    setStep("otp");
  };

  // ── OTP verify
  const handleOtp = () => {
    const entered = otpCode.join("");
    if (entered.length < 6) { setOtpError("Please enter the 6-digit code."); return; }
    if (entered !== generatedOtp) { setOtpError("Incorrect code. Please try again."); return; }
    setOtpError("");
    setStep("subscribe");
  };

  const resendOtp = async () => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(otp);
    setOtpCode(["", "", "", "", "", ""]);
    setOtpError("");
    if (newUser) {
      const emailResult = await sendZeptoMail({
        templateParams: {
          to_email: newUser.email,
          to_name: newUser.name,
          subject: "Hub43 – New Verification Code",
          message: `Hi ${newUser.name},\n\nYour new Hub43 verification code is:\n\n${otp}\n\nThis code is valid for 10 minutes.\n\nHub43 Workspace Team`,
        },
      });
      setOtpEmailOk(emailResult.ok);
    }
  };

  // ── Subscribe: select services + plans
  const toggleService = (svcId) => {
    setSelectedServices(prev =>
      prev.includes(svcId) ? prev.filter(s => s !== svcId) : [...prev, svcId]
    );
    if (!selectedPlans[svcId]) {
      const svc = ONBOARDING_SERVICES.find(s => s.id === svcId);
      if (svc) setSelectedPlans(prev => ({ ...prev, [svcId]: svc.plans[0].id }));
    }
  };

  const totalAmount = selectedServices.reduce((sum, svcId) => {
    const svc = ONBOARDING_SERVICES.find(s => s.id === svcId);
    const plan = svc?.plans.find(p => p.id === selectedPlans[svcId]);
    return sum + (plan?.price || 0);
  }, 0);

  // ── Payment: confirm and activate
  const handlePayment = () => {
    if (!payMethod) { setPayError(true); return; }
    const isBankTransfer = payMethod === "bank_transfer";

    const commitOnboarding = () => {
      const today = new Date().toISOString().split("T")[0];
      const newSubs = selectedServices.map(svcId => {
        const svc = ONBOARDING_SERVICES.find(s => s.id === svcId);
        const plan = svc.plans.find(p => p.id === selectedPlans[svcId]);
        const endDate = plan.days > 0
          ? (() => { const d = new Date(); d.setDate(d.getDate() + plan.days); return d.toISOString().split("T")[0]; })()
          : today;
        return {
          id: "s" + Date.now() + svcId,
          userId: newUser.id,
          service: svcId,
          plan: plan.id,
          startDate: today,
          endDate,
          status: isBankTransfer ? "pending_transfer" : "active",
          amount: plan.price,
          paymentMethod: payMethod,
          paymentConfirmed: !isBankTransfer,
        };
      });
      const newInvoices = selectedServices.map((svcId, i) => {
        const svc = ONBOARDING_SERVICES.find(s => s.id === svcId);
        const plan = svc.plans.find(p => p.id === selectedPlans[svcId]);
        return {
          id: "inv" + Date.now() + i,
          userId: newUser.id,
          amount: plan.price,
          date: today,
          status: isBankTransfer ? "unpaid" : "paid",
          service: svc.label,
          description: `${svc.label} — ${plan.label} plan`,
        };
      });
      const welcomeNotif = {
        id: "n" + Date.now(),
        userId: newUser.id,
        type: isBankTransfer ? "warning" : "info",
        message: isBankTransfer
          ? `⏳ Welcome to Hub43, ${newUser.name.split(" ")[0]}! Your bank transfer is being verified. You'll get full access once admin confirms your payment.`
          : `🎉 Welcome to Hub43, ${newUser.name.split(" ")[0]}! Your ${selectedServices.length > 1 ? "subscriptions are" : "subscription is"} now active. Explore your dashboard below.`,
        read: false,
        date: today,
      };
      const cleanUser = { ...newUser, pendingOtp: false, pendingSubscription: false };
      setData(d => ({
        ...d,
        users: [...(d.users || []), cleanUser],
        userPasswords: { ...(d.userPasswords || {}), [newUser.id]: regPassword },
        subscriptions: [...(d.subscriptions || []), ...newSubs],
        invoices: [...(d.invoices || []), ...newInvoices],
        notifications: [...(d.notifications || []), welcomeNotif],
      }));
      setPayLoading(false);
      setStep("done");
    };

    if (!isBankTransfer) {
      const key = data.paymentMethods?.paystackKey;
      if (!key || !key.startsWith("pk_")) { alert("Paystack key not configured. Please contact the admin."); return; }
      openPaystackCheckout({
        key, email: newUser.email, amount: totalAmount, name: newUser.name,
        onOpen: () => setPsOpening(true),
        onSuccess: () => { setPsOpening(false); setPayLoading(true); commitOnboarding(); },
        onClose: () => setPsOpening(false),
      });
    } else {
      setPayLoading(true);
      setTimeout(commitOnboarding, 1800);
    }
  };

  // ── Enter dashboard
  const enterDashboard = () => onComplete(newUser);

  const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 };
  const btnPrimary = (disabled) => ({ width: "100%", padding: "12px", background: disabled ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" });

  const Hub43Logo = () => (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 48, height: 48, background: "#fff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: BRAND.blue }}>H</span>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1 }}>Hub<span style={{ color: BRAND.orange }}>43</span></div>
          <div style={{ fontSize: 11, color: "#93C5FD", letterSpacing: "0.12em" }}>WORKSPACE</div>
        </div>
      </div>
      <p style={{ color: "#93C5FD", fontSize: 13, margin: 0 }}>Work. Learn. Connect.</p>
    </div>
  );

  // ── Step progress indicator (for register/otp/subscribe/payment)
  const OnboardSteps = ({ current }) => {
    const steps = ["Account", "Verify", "Subscribe", "Payment"];
    const stepMap = { register: 0, otp: 1, subscribe: 2, payment: 3, done: 4 };
    const idx = stepMap[current] ?? 0;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, gap: 0 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: i < idx ? "#059669" : i === idx ? BRAND.blue : "#E5E7EB", color: i <= idx ? "#fff" : "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, transition: "all .3s" }}>
                {i < idx ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 10, color: i === idx ? BRAND.blue : "#9CA3AF", fontWeight: i === idx ? 700 : 400, marginTop: 4, whiteSpace: "nowrap" }}>{s}</div>
            </div>
            {i < steps.length - 1 && <div style={{ width: 40, height: 2, background: i < idx ? "#059669" : "#E5E7EB", margin: "0 4px", marginBottom: 16, transition: "all .3s" }} />}
          </div>
        ))}
      </div>
    );
  };

  const bg = { minHeight: "100vh", background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.darkBlue} 60%, #0F1F5C 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };

  // ════════════════ LOGIN ════════════════
  if (step === "login") return (
    <div style={bg}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Sign In</h2>
          {expiredSession && (
            <div style={{ background: "#FFF4EA", border: `1.5px solid ${BRAND.orange}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400E", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <span>⏰</span> Your session expired. Please sign in again.
            </div>
          )}
          {loginError && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>{loginError}</div>}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email Address</label>
            <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} type="email" style={inputStyle} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Password</label>
            <input value={loginPassword} onChange={e => setLoginPassword(e.target.value)} type="password" style={inputStyle} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <div style={{ textAlign: "right", marginTop: 6 }}>
              <button onClick={() => { setLoginError(""); setResetEmail(loginEmail); setResetError(""); setStep("reset_email"); }} style={{ background: "none", border: "none", color: BRAND.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>Forgot password?</button>
            </div>
          </div>
          <button onClick={handleLogin} disabled={loginLoading} style={btnPrimary(loginLoading)}>
            {loginLoading ? "Signing in..." : "Sign In"}
          </button>
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <span style={{ fontSize: 13, color: "#6B7280" }}>New to Hub43? </span>
            <button onClick={() => { setLoginError(""); setStep("register"); }} style={{ background: "none", border: "none", color: BRAND.blue, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>Create an account →</button>
          </div>
          <div style={{ marginTop: 20, borderTop: "1px solid #F3F4F6", paddingTop: 16 }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10, textAlign: "center" }}>Quick login (demo)</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ label: "Admin", email: "admin@hub43.com", pass: "admin123" }, { label: "Front Desk", email: "frontdesk@hub43.com", pass: "frontdesk123" }, { label: "Chidi", email: "chidi@example.com", pass: "admin123" }].map(q => (
                <button key={q.label} onClick={() => { setLoginEmail(q.email); setLoginPassword(q.pass); }} style={{ flex: 1, padding: "6px 8px", background: BRAND.lightBlue, color: BRAND.blue, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{q.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════ REGISTER ════════════════
  if (step === "register") return (
    <div style={bg}>
      <div style={{ width: 460, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <OnboardSteps current="register" />
          <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Create Your Account</h2>
          <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6B7280" }}>Join Hub43 Workspace — your details are secure with us.</p>
          {regError && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>{regError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Amaka Johnson" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+234-800-000-0000" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Email Address *</label>
            <input value={regEmail} onChange={e => setRegEmail(e.target.value)} type="email" placeholder="you@example.com" style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Password *</label>
              <input value={regPassword} onChange={e => setRegPassword(e.target.value)} type="password" placeholder="Min 6 characters" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirm Password *</label>
              <input value={regConfirm} onChange={e => setRegConfirm(e.target.value)} type="password" placeholder="Re-enter password" style={inputStyle} />
            </div>
          </div>
          <button onClick={handleRegister} disabled={regLoading} style={btnPrimary(regLoading)}>
            {regLoading ? "Sending verification code..." : "Create Account & Get OTP"}
          </button>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span style={{ fontSize: 13, color: "#6B7280" }}>Already have an account? </span>
            <button onClick={() => { setRegError(""); setStep("login"); }} style={{ background: "none", border: "none", color: BRAND.blue, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>Sign in →</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════ OTP VERIFICATION ════════════════
  if (step === "otp") return (
    <div style={bg}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <OnboardSteps current="otp" />
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, background: BRAND.lightBlue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Icon name="mail" size={28} color={BRAND.blue} />
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Verify Your Email</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>A 6-digit code was sent to<br /><strong style={{ color: "#374151" }}>{newUser?.email}</strong></p>
          </div>

          {/* Email sent confirmation */}
          <div style={{ background: otpEmailOk === false ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${otpEmailOk === false ? "#FDE68A" : "#BBF7D0"}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: otpEmailOk === false ? "#92400E" : "#16A34A" }}>
              {otpEmailOk === false
                ? "📬 Email delivery pending — check your inbox or spam. If nothing arrives, use the code shown in the mailto window that opened."
                : "✅ Code sent to your email"}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Check your inbox (and spam folder). Valid for 10 minutes.</div>
          </div>

          {otpError && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16, textAlign: "center" }}>{otpError}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }}>
            {otpCode.map((digit, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                value={digit}
                maxLength={1}
                onChange={e => {
                  const val = e.target.value.replace(/\D/, "");
                  const next = [...otpCode]; next[i] = val; setOtpCode(next);
                  if (val && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
                }}
                onKeyDown={e => {
                  if (e.key === "Backspace" && !digit && i > 0) document.getElementById(`otp-${i - 1}`)?.focus();
                }}
                style={{ width: 48, height: 56, textAlign: "center", fontSize: 22, fontWeight: 800, border: `2px solid ${digit ? BRAND.blue : "#E5E7EB"}`, borderRadius: 10, outline: "none", color: BRAND.blue, transition: "border-color .15s" }}
              />
            ))}
          </div>
          <button onClick={handleOtp} style={btnPrimary(false)}>Verify & Continue</button>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span style={{ fontSize: 13, color: "#6B7280" }}>Didn't receive it? </span>
            <button onClick={resendOtp} style={{ background: "none", border: "none", color: BRAND.blue, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>Generate new code</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════ SUBSCRIBE ════════════════
  if (step === "subscribe") return (
    <div style={{ ...bg, alignItems: "flex-start", paddingTop: 40, paddingBottom: 40 }}>
      <div style={{ width: 680, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <OnboardSteps current="subscribe" />
          <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Choose Your Services</h2>
          <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6B7280" }}>Select one or more services. Your dashboard will only show what you subscribe to.</p>
          {subscribeError && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>{subscribeError}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {ONBOARDING_SERVICES.map(svc => {
              const selected = selectedServices.includes(svc.id);
              const currentPlanId = selectedPlans[svc.id] || svc.plans[0].id;
              const currentPlan = svc.plans.find(p => p.id === currentPlanId);
              return (
                <div key={svc.id} onClick={() => toggleService(svc.id)}
                  style={{ border: `2px solid ${selected ? svc.color : "#E5E7EB"}`, borderRadius: 14, padding: 18, cursor: "pointer", background: selected ? svc.color + "08" : "#fff", transition: "all .2s", position: "relative" }}>
                  {selected && (
                    <div style={{ position: "absolute", top: 12, right: 12, width: 22, height: 22, background: svc.color, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>✓</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, background: svc.color + "18", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name={svc.icon} size={18} color={svc.color} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: selected ? svc.color : "#111" }}>{svc.label}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 12 }}>{svc.desc}</div>
                  {selected && (
                    <div onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Select Plan:</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {svc.plans.map(plan => (
                          <button key={plan.id} onClick={e => { e.stopPropagation(); setSelectedPlans(prev => ({ ...prev, [svc.id]: plan.id })); }}
                            style={{ padding: "5px 10px", borderRadius: 6, border: `1.5px solid ${currentPlanId === plan.id ? svc.color : "#E5E7EB"}`, background: currentPlanId === plan.id ? svc.color : "#F9FAFB", color: currentPlanId === plan.id ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            {plan.label} — {formatNGN(plan.price)}{plan.suffix}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selected && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: svc.color }}>
                      from {formatNGN(svc.plans[0].price)}<span style={{ fontSize: 11, fontWeight: 400, color: "#9CA3AF" }}>{svc.plans[0].suffix}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedServices.length > 0 && (
            <div style={{ background: BRAND.lightBlue, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.blue, marginBottom: 8 }}>Your Selection</div>
              {selectedServices.map(svcId => {
                const svc = ONBOARDING_SERVICES.find(s => s.id === svcId);
                const plan = svc?.plans.find(p => p.id === selectedPlans[svcId]);
                return (
                  <div key={svcId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", marginBottom: 4 }}>
                    <span>{svc?.label} — {plan?.label}</span>
                    <span style={{ fontWeight: 700 }}>{formatNGN(plan?.price || 0)}</span>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid #BFDBFE", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, color: BRAND.blue }}>
                <span>Total</span>
                <span>{formatNGN(totalAmount)}</span>
              </div>
            </div>
          )}

          <button onClick={() => { if (selectedServices.length === 0) { setSubscribeError("Please select at least one service to continue."); return; } setSubscribeError(""); setStep("payment"); }}
            style={btnPrimary(selectedServices.length === 0)}>
            Continue to Payment →
          </button>
        </div>
      </div>
    </div>
  );

  // ════════════════ PAYMENT ════════════════
  if (step === "payment") return (
    <div style={{ ...bg, alignItems: "flex-start", paddingTop: 40, paddingBottom: 40 }}>
      <div style={{ width: 520, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <OnboardSteps current="payment" />
          <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Complete Payment</h2>
          <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6B7280" }}>Your dashboard activates immediately after payment confirmation.</p>

          {/* Order summary */}
          <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Order Summary</div>
            {selectedServices.map(svcId => {
              const svc = ONBOARDING_SERVICES.find(s => s.id === svcId);
              const plan = svc?.plans.find(p => p.id === selectedPlans[svcId]);
              return (
                <div key={svcId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", marginBottom: 6, alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, background: svc.color + "18", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={svc.icon} size={14} color={svc.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{svc?.label}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{plan?.label} plan</div>
                    </div>
                  </div>
                  <span style={{ fontWeight: 700 }}>{formatNGN(plan?.price || 0)}</span>
                </div>
              );
            })}
            <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: BRAND.blue }}>
              <span>Total Due</span>
              <span>{formatNGN(totalAmount)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Select Payment Method</div>
            {payError && !payMethod && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#DC2626", marginBottom: 10 }}>Please select a payment method.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { id: "bank_transfer", label: "Bank Transfer", sub: `${data.paymentMethods?.bankDetails?.bankName || "Bank"} — ${data.paymentMethods?.bankDetails?.accountNumber || "—"} (${data.paymentMethods?.bankDetails?.accountName || "Hub43"})`, icon: "💳" },
                { id: "paystack", label: "Pay Online (Paystack)", sub: "Debit/Credit card, USSD, bank transfer", icon: "🔒" },
              ].map(m => (
                <div key={m.id} onClick={() => { setPayMethod(m.id); setPayError(false); }}
                  style={{ border: `2px solid ${payMethod === m.id ? BRAND.blue : "#E5E7EB"}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", background: payMethod === m.id ? BRAND.lightBlue : "#fff", transition: "all .2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{m.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: payMethod === m.id ? BRAND.blue : "#111" }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>{m.sub}</div>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${payMethod === m.id ? BRAND.blue : "#D1D5DB"}`, background: payMethod === m.id ? BRAND.blue : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {payMethod === m.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                    </div>
                  </div>
                  {payMethod === m.id && m.id === "bank_transfer" && (() => {
                    const bd = data.paymentMethods?.bankDetails || {};
                    return (
                      <div style={{ marginTop: 12, background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #E5E7EB" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.bankName || "—"}</div></div>
                          <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div><div style={{ fontSize: 13, fontWeight: 800, color: "#111", letterSpacing: "0.08em" }}>{bd.accountNumber || "—"}</div></div>
                          <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.accountName || "—"}</div></div>
                        </div>
                        <div style={{ background: BRAND.lightOrange, borderRadius: 6, padding: "7px 10px", fontSize: 11, color: BRAND.orange }}>
                          Use your <strong>name + invoice amount</strong> as payment reference. Send proof to the front desk.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>

          <button onClick={handlePayment} disabled={payLoading || psOpening} style={btnPrimary(payLoading || psOpening)}>
            {payLoading ? "Saving..." : psOpening ? "Opening Paystack..." : `Confirm Payment — ${formatNGN(totalAmount)}`}
          </button>
          <button onClick={() => setStep("subscribe")} style={{ width: "100%", marginTop: 10, padding: "10px", background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ← Back to Services
          </button>
        </div>
      </div>
    </div>
  );

  // ════════════════ RESET — EMAIL ════════════════
  if (step === "reset_email") return (
    <div style={bg}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, background: BRAND.lightBlue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Icon name="mail" size={26} color={BRAND.blue} />
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Reset Password</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Enter your registered email address and we'll send you a verification code.</p>
          </div>

          {resetError && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>{resetError}</div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Email Address</label>
            <input
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              style={inputStyle}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const found = (allUsers || []).find(u => u.email === resetEmail.toLowerCase().trim());
                  if (!found) { setResetError("No account found with that email address."); return; }
                  setResetError("");
                  setResetLoading(true);
                  const otp = String(Math.floor(100000 + Math.random() * 900000));
                  setResetGeneratedOtp(otp);
                  const es = data?.emailSettings || {};
                  sendZeptoMail({ templateParams: { to_email: found.email, to_name: found.name, subject: "Hub43 – Password Reset Code", message: `Hi ${found.name},\n\nYour Hub43 password reset code is:\n\n${otp}\n\nValid for 10 minutes. If you did not request this, ignore this email.\n\nHub43 Workspace Team` } });
                  setTimeout(() => { setResetLoading(false); setStep("reset_otp"); }, 900);
                }
              }}
            />
          </div>

          <button
            disabled={resetLoading}
            onClick={async () => {
              const found = (allUsers || []).find(u => u.email === resetEmail.toLowerCase().trim());
              if (!found) { setResetError("No account found with that email address."); return; }
              setResetError("");
              setResetLoading(true);
              const otp = String(Math.floor(100000 + Math.random() * 900000));
              setResetGeneratedOtp(otp);
              const es = data?.emailSettings || {};
              await sendZeptoMail({ templateParams: { to_email: found.email, to_name: found.name, subject: "Hub43 – Password Reset Code", message: `Hi ${found.name},\n\nYour Hub43 password reset code is:\n\n${otp}\n\nValid for 10 minutes. If you did not request this, ignore this email.\n\nHub43 Workspace Team` } });
              setResetLoading(false);
              setStep("reset_otp");
            }}
            style={btnPrimary(resetLoading)}
          >
            {resetLoading ? "Sending code..." : "Send Verification Code"}
          </button>

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setResetError(""); setStep("login"); }} style={{ background: "none", border: "none", color: "#6B7280", fontSize: 13, cursor: "pointer", padding: 0 }}>← Back to Sign In</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════ RESET — OTP ════════════════
  if (step === "reset_otp") return (
    <div style={bg}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, background: BRAND.lightBlue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Icon name="mail" size={26} color={BRAND.blue} />
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Check Your Email</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>A 6-digit code was sent to<br /><strong style={{ color: "#374151" }}>{resetEmail}</strong></p>
          </div>

          {/* Email sent confirmation */}
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "12px 16px", marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>✅ Reset code sent via ZeptoMail</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Check your inbox (and spam folder). Valid for 10 minutes.</div>
          </div>

          {resetError && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16, textAlign: "center" }}>{resetError}</div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
            {resetOtp.map((digit, i) => (
              <input
                key={i}
                id={`rotp-${i}`}
                value={digit}
                maxLength={1}
                onChange={e => {
                  const val = e.target.value.replace(/\D/, "");
                  const next = [...resetOtp]; next[i] = val; setResetOtp(next);
                  if (val && i < 5) document.getElementById(`rotp-${i + 1}`)?.focus();
                }}
                onKeyDown={e => {
                  if (e.key === "Backspace" && !digit && i > 0) document.getElementById(`rotp-${i - 1}`)?.focus();
                }}
                style={{ width: 48, height: 56, textAlign: "center", fontSize: 22, fontWeight: 800, border: `2px solid ${digit ? BRAND.blue : "#E5E7EB"}`, borderRadius: 10, outline: "none", color: BRAND.blue, transition: "border-color .15s" }}
              />
            ))}
          </div>

          <button
            onClick={() => {
              const entered = resetOtp.join("");
              if (entered.length < 6) { setResetError("Please enter the 6-digit code."); return; }
              if (entered !== resetGeneratedOtp) { setResetError("Incorrect code. Please try again."); return; }
              setResetError(""); setStep("reset_password");
            }}
            style={btnPrimary(false)}
          >
            Verify Code
          </button>

          <div style={{ textAlign: "center", marginTop: 14, display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => { setResetError(""); setStep("reset_email"); }} style={{ background: "none", border: "none", color: "#6B7280", fontSize: 12, cursor: "pointer", padding: 0 }}>← Change email</button>
            <button
              onClick={async () => {
                const otp = String(Math.floor(100000 + Math.random() * 900000));
                setResetGeneratedOtp(otp);
                setResetOtp(["", "", "", "", "", ""]);
                setResetError("");
                const found = (allUsers || []).find(u => u.email === resetEmail.toLowerCase().trim());
                if (found) {
                  const es = data?.emailSettings || {};
                  await sendZeptoMail({ templateParams: { to_email: found.email, to_name: found.name, subject: "Hub43 – New Password Reset Code", message: `Hi ${found.name},\n\nYour new Hub43 password reset code is:\n\n${otp}\n\nValid for 10 minutes.\n\nHub43 Workspace Team` } });
                }
              }}
              style={{ background: "none", border: "none", color: BRAND.blue, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              Resend code
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════ RESET — NEW PASSWORD ════════════════
  if (step === "reset_password") return (
    <div style={bg}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, background: "#F0FDF4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Icon name="check" size={26} color="#16A34A" />
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Set New Password</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Identity confirmed. Choose a strong new password for <strong style={{ color: "#374151" }}>{resetEmail}</strong>.</p>
          </div>

          {resetError && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>{resetError}</div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New Password</label>
            <div style={{ position: "relative" }}>
              <input
                value={resetNewPassword}
                onChange={e => setResetNewPassword(e.target.value)}
                type={resetShowPass ? "text" : "password"}
                placeholder="Min. 6 characters"
                style={{ ...inputStyle, paddingRight: 54 }}
              />
              <button
                onClick={() => setResetShowPass(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}
              >{resetShowPass ? "Hide" : "Show"}</button>
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              value={resetConfirm}
              onChange={e => setResetConfirm(e.target.value)}
              type={resetShowPass ? "text" : "password"}
              placeholder="Re-enter password"
              style={inputStyle}
              onKeyDown={e => {
                if (e.key !== "Enter") return;
                if (resetNewPassword.length < 6) { setResetError("Password must be at least 6 characters."); return; }
                if (resetNewPassword !== resetConfirm) { setResetError("Passwords do not match."); return; }
                setResetError(""); setResetLoading(true);
                setTimeout(() => {
                  const found = (allUsers || []).find(u => u.email === resetEmail.toLowerCase().trim());
                  if (found) {
                    setData(d => ({ ...d, userPasswords: { ...(d.userPasswords || {}), [found.id]: resetNewPassword } }));
                  }
                  setResetLoading(false);
                  setResetNewPassword(""); setResetConfirm("");
                  setStep("reset_done");
                }, 900);
              }}
            />
          </div>

          {/* Password strength indicator */}
          {resetNewPassword.length > 0 && (() => {
            const len = resetNewPassword.length;
            const hasUpper = /[A-Z]/.test(resetNewPassword);
            const hasNum = /\d/.test(resetNewPassword);
            const hasSpecial = /[^A-Za-z0-9]/.test(resetNewPassword);
            const score = (len >= 8 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNum ? 1 : 0) + (hasSpecial ? 1 : 0);
            const labels = ["", "Weak", "Fair", "Good", "Strong"];
            const colors = ["", BRAND.red, BRAND.orange, "#F59E0B", "#16A34A"];
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= score ? colors[score] : "#E5E7EB", transition: "background .2s" }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: colors[score], fontWeight: 600 }}>{labels[score]}</div>
              </div>
            );
          })()}

          <button
            disabled={resetLoading}
            onClick={() => {
              if (resetNewPassword.length < 6) { setResetError("Password must be at least 6 characters."); return; }
              if (resetNewPassword !== resetConfirm) { setResetError("Passwords do not match."); return; }
              setResetError(""); setResetLoading(true);
              setTimeout(() => {
                const found = (allUsers || []).find(u => u.email === resetEmail.toLowerCase().trim());
                if (found) {
                  setData(d => ({ ...d, userPasswords: { ...(d.userPasswords || {}), [found.id]: resetNewPassword } }));
                }
                setResetLoading(false);
                setResetNewPassword(""); setResetConfirm("");
                setStep("reset_done");
              }, 900);
            }}
            style={btnPrimary(resetLoading)}
          >
            {resetLoading ? "Saving..." : "Set New Password"}
          </button>
        </div>
      </div>
    </div>
  );

  // ════════════════ RESET — DONE ════════════════
  if (step === "reset_done") return (
    <div style={bg}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <Hub43Logo />
        <div style={{ background: "#fff", borderRadius: 20, padding: 40, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, background: "#F0FDF4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <Icon name="check" size={36} color="#16A34A" />
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 900, color: BRAND.blue }}>Password Updated!</h2>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            Your password has been changed successfully.<br />You can now sign in with your new password.
          </p>
          <button
            onClick={() => {
              setLoginEmail(resetEmail);
              setLoginPassword("");
              setResetEmail(""); setResetOtp(["","","","","",""]); setResetGeneratedOtp("");
              setStep("login");
            }}
            style={btnPrimary(false)}
          >
            Sign In Now →
          </button>
        </div>
      </div>
    </div>
  );

  // ════════════════ DONE ════════════════
  if (step === "done") {
    const isBankDone = payMethod === "bank_transfer";
    return (
      <div style={bg}>
        <div style={{ width: 460, maxWidth: "100%", textAlign: "center" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 48, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            <div style={{ width: 80, height: 80, background: isBankDone ? "#FFF4EA" : "#DCFCE7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <span style={{ fontSize: 40 }}>{isBankDone ? "⏳" : "🎉"}</span>
            </div>
            <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 900, color: BRAND.blue }}>
              {isBankDone ? "Transfer Submitted!" : "Welcome to Hub43!"}
            </h2>
            <p style={{ margin: "0 0 8px", fontSize: 15, color: "#374151", fontWeight: 600 }}>{newUser?.name}</p>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
              {isBankDone
                ? "Your bank transfer is being reviewed. You'll receive full access once an admin confirms your payment — usually within a few hours."
                : `Your subscription${selectedServices.length > 1 ? "s are" : " is"} now active. Your dashboard is ready.`}
            </p>
            {isBankDone && (
              <div style={{ background: "#FFF4EA", border: `1.5px solid ${BRAND.orange}44`, borderRadius: 12, padding: 16, marginBottom: 20, textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange, marginBottom: 10 }}>Bank Transfer Details</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[["Bank", data.paymentMethods?.bankDetails?.bankName || "—"], ["Account Name", data.paymentMethods?.bankDetails?.accountName || "—"], ["Account No.", data.paymentMethods?.bankDetails?.accountNumber || "—"], ["Reference", newUser?.name || "Your Name"]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#9CA3AF" }}>{k}</span>
                      <span style={{ fontWeight: 700, color: "#374151" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: BRAND.orange, background: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 600 }}>
                  ⚠️ Use your full name as the payment reference so we can match it quickly.
                </div>
              </div>
            )}
            <div style={{ background: isBankDone ? "#F9FAFB" : BRAND.lightBlue, borderRadius: 12, padding: 16, marginBottom: 24, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isBankDone ? "#6B7280" : BRAND.blue, marginBottom: 8 }}>
                {isBankDone ? "Pending Services" : "Active Services"}
              </div>
              {selectedServices.map(svcId => {
                const svc = ONBOARDING_SERVICES.find(s => s.id === svcId);
                const plan = svc?.plans.find(p => p.id === selectedPlans[svcId]);
                return (
                  <div key={svcId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: isBankDone ? BRAND.orange : "#059669" }} />
                    <span style={{ fontSize: 13, color: "#374151" }}>{svc?.label} — <span style={{ color: isBankDone ? BRAND.orange : "#059669", fontWeight: 700 }}>{plan?.label}</span></span>
                  </div>
                );
              })}
            </div>
            <button onClick={enterDashboard} style={{ ...btnPrimary(false), fontSize: 15 }}>
              {isBankDone ? "View My Dashboard →" : "Enter My Dashboard →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// ─── LOGIN PAGE (alias for backward compat) ───────────────────────────────────
const LoginPage = ({ onLogin, allUsers, allPasswords, data, setData, expiredSession }) => (
  <OnboardingFlow onComplete={onLogin} allUsers={allUsers} allPasswords={allPasswords} data={data} setData={setData} expiredSession={expiredSession} />
);

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
const AdminDashboard = ({ data }) => {
  const totalRevenue = data.invoices.reduce((s, i) => s + i.amount, 0)
    + data.subscriptions.filter(s => s.status === "active").reduce((s, sub) => s + sub.amount, 0);
  const activeSubscriptions = data.subscriptions.filter(s => s.status === "active").length;
  const pendingBookings = data.bookings.filter(b => b.status === "pending").length;
  const occupiedOffices = data.offices.filter(o => o.status === "occupied").length;
  const activeVirtual = data.subscriptions.filter(s => s.service === "virtual_office" && s.status === "active").length;
  const activePrivate = data.subscriptions.filter(s => s.service === "private_office" && s.status === "active").length;
  const hotDeskToday = data.bookings.filter(b => b.service === "hot_desk" && b.date === new Date().toISOString().split("T")[0]).length;
  const totalMembers = data.users.filter(u => u.role === "member").length;
  const totalExpenses = (data.expenses || []).reduce((s, e) => s + e.amount, 0);

  // ── Weekly revenue trend (last 6 weeks from invoices + subscriptions)
  const weeklyRevenue = (() => {
    const weeks = [];
    const now = new Date();
    for (let w = 5; w >= 0; w--) {
      const start = new Date(now);
      const dow = start.getDay();
      const monday = new Date(start);
      monday.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1) - w * 7);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      const monStr = monday.toISOString().split("T")[0];
      const sunStr = sunday.toISOString().split("T")[0];
      const label = `${monday.toLocaleDateString("en-NG", { month: "short", day: "numeric" })}`;
      const rev = data.invoices
        .filter(i => i.date >= monStr && i.date <= sunStr)
        .reduce((s, i) => s + i.amount, 0);
      const exp = (data.expenses || [])
        .filter(e => e.date >= monStr && e.date <= sunStr)
        .reduce((s, e) => s + e.amount, 0);
      weeks.push({ label, revenue: rev, expenses: exp });
    }
    return weeks;
  })();

  // ── Office occupancy pie
  const occupancyData = [
    { name: "Occupied", value: occupiedOffices, color: BRAND.orange },
    { name: "Available", value: data.offices.length - occupiedOffices, color: "#E5E7EB" },
  ];

  // ── Expense category breakdown (from current month)
  const expCatData = (() => {
    const cats = {};
    const catColors = { Fuel: BRAND.orange, Utilities: BRAND.blue, Maintenance: "#7C3AED", Refreshments: "#059669", Cleaning: "#0EA5E9", Signage: BRAND.red };
    (data.expenses || []).forEach(e => {
      cats[e.category] = (cats[e.category] || 0) + e.amount;
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value, color: catColors[name] || "#9CA3AF" }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  })();

  const serviceRevenue = [
    { name: "Hot Desk", value: data.invoices.filter(i => i.service === "Hot Desk").reduce((s,i)=>s+i.amount,0), color: BRAND.blue },
    { name: "Private Office", value: data.invoices.filter(i => i.service === "Private Office").reduce((s,i)=>s+i.amount,0) + data.subscriptions.filter(s=>s.service==="private_office"&&s.status==="active").reduce((s,sub)=>s+sub.amount,0), color: BRAND.orange },
    { name: "Meeting Room", value: data.invoices.filter(i => i.service === "Meeting Room").reduce((s,i)=>s+i.amount,0), color: "#7C3AED" },
    { name: "Virtual Office", value: data.subscriptions.filter(s=>s.service==="virtual_office"&&s.status==="active").reduce((s,sub)=>s+sub.amount,0), color: "#059669" },
  ];

  const chartCard = (title, children) => (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#374151" }}>{title}</h3>
      {children}
    </div>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: "#374151" }}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {formatNGN(p.value)}</div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Admin Dashboard</h2>

      {/* Top KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Revenue" value={formatNGN(totalRevenue)} icon="chart" color={BRAND.blue} />
        <StatCard label="Total Members" value={totalMembers} icon="users" color={BRAND.orange} />
        <StatCard label="Active Subscriptions" value={activeSubscriptions} icon="star" color="#7C3AED" />
        <StatCard label="Pending Approvals" value={pendingBookings} sub={pendingBookings > 0 ? "Needs action" : "All clear"} icon="calendar" color={pendingBookings > 0 ? BRAND.red : "#059669"} />
        <StatCard label="Offices Occupied" value={`${occupiedOffices}/${data.offices.length}`} icon="office" color={BRAND.red} />
        <StatCard label="Total Expenses" value={formatNGN(totalExpenses)} icon="wallet" color="#6B7280" />
      </div>

      {/* Charts row 1: Revenue trend + Occupancy + Service mix */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        {chartCard("Revenue vs Expenses — Last 6 Weeks",
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyRevenue} barGap={4}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue" fill={BRAND.blue} radius={[4,4,0,0]} />
              <Bar dataKey="expenses" name="Expenses" fill={BRAND.orange} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {chartCard("Office Occupancy",
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={occupancyData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2}>
                  {occupancyData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              {occupancyData.map(d => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />
                  <span style={{ color: "#6B7280" }}>{d.name}: <strong>{d.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Charts row 2: Expense category + Service revenue bar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {chartCard("Expense Breakdown by Category",
          expCatData.length === 0
            ? <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No expense data</div>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={expCatData} layout="vertical" margin={{ left: 8 }}>
                  <XAxis type="number" tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Amount" radius={[0,4,4,0]}>
                    {expCatData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
        )}
        {chartCard("Revenue Mix by Service",
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={serviceRevenue}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Revenue" radius={[4,4,0,0]}>
                {serviceRevenue.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Recent Bookings</h3>
          {data.bookings.slice(0, 5).map(b => {
            const u = data.users.find(u => u.id === b.userId);
            return (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{b.service.replace(/_/g, " ")} · {b.date}</div>
                </div>
                <Badge status={b.status} />
              </div>
            );
          })}
        </div>

        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Active Subscriptions</h3>
          {data.subscriptions.filter(s => s.status === "active").map(s => {
            const u = data.users.find(u => u.id === s.userId);
            const dl = daysLeft(s.endDate);
            const svcColors = { private_office: BRAND.orange, virtual_office: "#059669", hot_desk: BRAND.blue };
            const col = svcColors[s.service] || BRAND.blue;
            return (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: col, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "capitalize" }}>{s.service.replace(/_/g," ")} · {s.plan}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: dl <= 7 ? BRAND.red : dl <= 30 ? BRAND.orange : "#059669" }}>{dl}d left</div>
                  <Badge status={s.status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── MEMBER DASHBOARD ─────────────────────────────────────────────────────────
const MemberDashboard = ({ user, data, setData, setActive }) => {
  const mySubs = data.subscriptions.filter(s => s.userId === user.id && s.status === "active");
  const myPendingTransfer = data.subscriptions.filter(s => s.userId === user.id && s.status === "pending_transfer");
  const myBookings = data.bookings.filter(b => b.userId === user.id);
  const myInvoices = data.invoices.filter(i => i.userId === user.id);
  const myNotifs = data.notifications.filter(n => n.userId === user.id);

  // One-click renewal state
  const [renewingId, setRenewingId] = useState(null);
  const [renewSuccess, setRenewSuccess] = useState("");
  const [renewModal, setRenewModal] = useState(null); // sub object
  const [renewPayMethod, setRenewPayMethod] = useState(null);
  const [renewProcessing, setRenewProcessing] = useState(false);

  const openRenewModal = (sub) => { setRenewModal(sub); setRenewPayMethod(null); };
  const closeRenewModal = () => { setRenewModal(null); setRenewPayMethod(null); setRenewProcessing(false); };

  const handleQuickRenew = (sub, chosenPayMethod) => {
    setRenewProcessing(true);
    setRenewingId(sub.id);
    setTimeout(() => {
      const getPlanDays = (service, plan) => {
        if (service === "virtual_office") {
          const vp = (data.plans.virtual_office || []).find(p => p.id === plan);
          return vp ? vp.days : 0;
        }
        return OFFICE_PLAN_DAYS[plan] || 0;
      };
      const getPlanPrice = (s) => {
        if (s.service === "private_office") {
          const office = data.offices.find(o => o.id === s.officeId);
          return office?.pricing?.[s.plan] || s.amount;
        }
        if (s.service === "virtual_office") {
          const vp = (data.plans.virtual_office || []).find(p => p.id === s.plan);
          return vp?.price || s.amount;
        }
        return s.amount;
      };
      const days = getPlanDays(sub.service, sub.plan);
      const price = getPlanPrice(sub);
      const baseDate = new Date(Math.max(new Date(sub.endDate), new Date()));
      const newEnd = new Date(baseDate); newEnd.setDate(baseDate.getDate() + days);
      const today = new Date().toISOString().split("T")[0];
      const isBankTransfer = chosenPayMethod === "bank";
      const renewedSub = {
        id: "s" + Date.now(), userId: sub.userId, service: sub.service, plan: sub.plan,
        startDate: baseDate.toISOString().split("T")[0],
        endDate: newEnd.toISOString().split("T")[0],
        status: isBankTransfer ? "pending_transfer" : "active",
        officeId: sub.officeId || null, amount: price,
        paymentMethod: chosenPayMethod, paymentConfirmed: !isBankTransfer,
      };
      setData(d => {
        const es = d.emailSettings || {};
        const member = d.users.find(u => u.id === sub.userId);
        let emailLogEntry = null;
        if (member && !isBankTransfer && es.enableSubscriptionRenewed !== false) {
          const params = buildEmailParams.subscriptionRenewed({ user: member, sub: renewedSub });
          sendZeptoMail({ templateParams: params });
          emailLogEntry = { id: "el" + Date.now(), type: "subscription_renewed", to: member.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
        }
        return {
          ...d,
          subscriptions: [
            ...d.subscriptions.map(s => s.id === sub.id ? { ...s, status: "expired" } : s),
            renewedSub,
          ],
          invoices: [...d.invoices, {
            id: "inv" + Date.now(), userId: sub.userId, amount: price, date: today,
            status: isBankTransfer ? "unpaid" : "paid",
            service: sub.service === "private_office" ? "Private Office" : "Virtual Office",
            description: `Renewal — ${sub.service.replace(/_/g," ")} (${sub.plan})`,
          }],
          notifications: [...d.notifications, {
            id: "n" + Date.now(), userId: sub.userId, type: isBankTransfer ? "warning" : "info",
            message: isBankTransfer
              ? `⏳ Renewal for ${sub.service.replace(/_/g," ")} submitted via bank transfer. Access will resume once admin confirms your payment.`
              : `✅ Your ${sub.service.replace(/_/g," ")} has been renewed (${sub.plan} plan) until ${newEnd.toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}.`,
            read: false, date: today,
          }],
          ...(emailLogEntry ? { emailSettings: { ...es, emailLog: [...(es.emailLog || []), emailLogEntry] } } : {}),
        };
      });
      setRenewingId(null);
      closeRenewModal();
      setRenewSuccess(isBankTransfer ? `Renewal submitted — awaiting bank transfer confirmation.` : `${sub.service.replace(/_/g," ")} renewed!`);
      setTimeout(() => setRenewSuccess(""), 5000);
    }, 1200);
  };

  // Check for approved hot desk booking today
  const today = new Date().toISOString().split("T")[0];
  const approvedHotDesk = myBookings.find(b =>
    b.service === "hot_desk" && b.status === "approved" &&
    (b.date === today || (b.plan === "monthly" && b.date <= today && b.endDate >= today))
  );

  const wifiCard = (
    <div style={{ background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)", border: `2px solid ${BRAND.blue}33`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="wifi" size={18} color={BRAND.blue} />
        <span style={{ fontWeight: 800, color: BRAND.blue, fontSize: 14 }}>WiFi Access</span>
        <span style={{ marginLeft: "auto", background: "#DCFCE7", color: "#16A34A", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>ACTIVE</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Network</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>{data.wifi.ssid}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Password</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#111", background: "#fff", borderRadius: 5, padding: "3px 8px", display: "inline-block", letterSpacing: "0.04em" }}>{data.wifi.password}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#6B7280", display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: BRAND.red }} />
        Do not share this password
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Welcome back, {user.name.split(" ")[0]}! 👋</h2>
        <p style={{ margin: 0, color: "#6B7280", fontSize: 13 }}>Here's your Hub43 workspace overview.</p>
      </div>

      {/* Pending bank transfer banner */}
      {myPendingTransfer.length > 0 && (
        <div style={{ background: "#FFF4EA", border: `2px solid ${BRAND.orange}55`, borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>⏳</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.orange, marginBottom: 4 }}>Bank Transfer Awaiting Confirmation</div>
              <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.6, marginBottom: 10 }}>
                Your payment is being verified by the Hub43 team. You'll receive a notification and email once confirmed — usually within a few hours.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {myPendingTransfer.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#78350F" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: BRAND.orange, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, textTransform: "capitalize" }}>{s.service.replace(/_/g," ")}</span>
                    <span style={{ color: "#9CA3AF" }}>·</span>
                    <span>{s.plan} plan</span>
                    <span style={{ color: "#9CA3AF" }}>·</span>
                    <span style={{ fontWeight: 700 }}>{formatNGN(s.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WiFi card — shown when admin has approved a hot desk booking */}
      {approvedHotDesk && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#16A34A", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="check" size={14} color="#16A34A" /> Hot Desk approved today — here are your WiFi credentials
          </div>
          {wifiCard}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Active Subscriptions" value={mySubs.length} icon="star" color={BRAND.orange} />
        <StatCard label="Total Bookings" value={myBookings.length} icon="calendar" color={BRAND.blue} />
        <StatCard label="Total Spent" value={formatNGN(myInvoices.reduce((s, i) => s + i.amount, 0))} icon="invoice" color={BRAND.red} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {mySubs.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Active Subscriptions</h3>
            {renewSuccess && (
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
                <Icon name="check" size={14} color="#16A34A" /> {renewSuccess}
              </div>
            )}
            {mySubs.map(s => {
              const dl = daysLeft(s.endDate);
              const expiringSoon = dl <= 14;
              const canRenew = s.service === "private_office" || s.service === "virtual_office";
              const isRenewing = renewingId === s.id;
              return (
                <div key={s.id} style={{ background: expiringSoon ? "#FFFBEB" : BRAND.lightBlue, borderRadius: 10, padding: "12px 14px", marginBottom: 10, border: expiringSoon ? "1px solid #FDE68A" : "1px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue, textTransform: "capitalize" }}>{s.service.replace("_", " ")} — {s.plan}</div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Expires: {formatDate(s.endDate)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: dl <= 7 ? BRAND.red : dl <= 14 ? BRAND.orange : "#059669", marginTop: 2 }}>
                        {dl} days remaining {expiringSoon && "⚠️"}
                      </div>
                    </div>
                    {canRenew && (
                      <button onClick={() => openRenewModal(s)} disabled={isRenewing}
                        style={{ padding: "6px 14px", background: expiringSoon ? BRAND.orange : BRAND.blue, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: isRenewing ? "not-allowed" : "pointer", opacity: isRenewing ? 0.7 : 1, flexShrink: 0, marginLeft: 10 }}>
                        {isRenewing ? "Processing…" : expiringSoon ? "⚡ Renew Now" : "Renew"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Notifications</h3>
          {myNotifs.length === 0 && <p style={{ color: "#9CA3AF", fontSize: 13 }}>No notifications</p>}
          {myNotifs.map(n => (
            <div key={n.id} style={{ padding: "10px 0", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: n.read ? "#D1D5DB" : BRAND.orange, marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: "#374151" }}>{n.message}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{formatDate(n.date)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.darkBlue})`, borderRadius: 14, padding: "20px 24px", color: "#fff" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>My Services</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["hot_desk", "desk", "Hot Desk"], ["private_office", "office", "Private Office"], ["meeting_room", "meeting", "Meeting Room"], ["virtual_office", "virtual", "Virtual Office"]]
            .filter(([key]) => mySubs.some(s => s.service === key))
            .map(([key, icon, label]) => (
              <button key={key} onClick={() => setActive(key)} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name={icon} size={14} color="#fff" /> {label}
              </button>
            ))}
          <button onClick={() => setActive("add_service")} style={{ background: "rgba(255,255,255,0.08)", border: "1px dashed rgba(255,255,255,0.4)", borderRadius: 8, padding: "8px 14px", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="plus" size={14} color="rgba(255,255,255,0.8)" /> Add Service
          </button>
        </div>
      </div>

      {/* Renewal payment method modal */}
      {renewModal && (
        <Modal open={!!renewModal} onClose={closeRenewModal} title={`Renew — ${renewModal.service.replace(/_/g," ")} (${renewModal.plan})`}>
          <div style={{ background: BRAND.lightBlue, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Renewing plan</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginTop: 4, textTransform: "capitalize" }}>{renewModal.service.replace(/_/g," ")} — {renewModal.plan}</div>
          </div>
          <PaymentSelector paymentMethods={data.paymentMethods} amount={renewModal.amount} selected={renewPayMethod} onChange={setRenewPayMethod} paying={renewProcessing} />
          <button
            onClick={() => renewPayMethod && handleQuickRenew(renewModal, renewPayMethod)}
            disabled={!renewPayMethod || renewProcessing}
            style={{ width: "100%", padding: "12px", background: !renewPayMethod || renewProcessing ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: !renewPayMethod || renewProcessing ? "not-allowed" : "pointer" }}>
            {renewProcessing ? "Processing…" : "Confirm Renewal"}
          </button>
        </Modal>
      )}
    </div>
  );
};

// ─── HOT DESK ────────────────────────────────────────────────────────────────
// Hot Desk plan definitions
const HOT_DESK_PLANS = [
  { id: "hourly",  label: "Hourly",  desc: "Book by the hour — specify date & hours needed." },
  { id: "daily",   label: "Daily",   desc: "Full day access (9am – 5pm)." },
  { id: "monthly", label: "Monthly", desc: "30-day unlimited hot desk access." },
];

const HotDeskView = ({ user, data, setData }) => {
  const [selPlan, setSelPlan] = useState(null);
  const [bookDate, setBookDate] = useState(new Date().toISOString().split("T")[0]);
  const [bookHours, setBookHours] = useState(2);
  const [paying, setPaying] = useState(false);
  const [psOpening, setPsOpening] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastPayMethod, setLastPayMethod] = useState(null);
  const [payMethod, setPayMethod] = useState(null);

  const myBookings = data.bookings.filter(b => b.userId === user.id && b.service === "hot_desk");

  // Check for any admin-approved hot desk booking (active today for hourly/daily, or in range for monthly)
  const today = new Date().toISOString().split("T")[0];
  const approvedToday = myBookings.find(b =>
    b.status === "approved" &&
    (b.date === today || (b.plan === "monthly" && b.date <= today && b.endDate >= today))
  );

  const getAmount = () => {
    if (selPlan === "hourly") return bookHours * data.hotDeskPricing.hourly;
    return data.hotDeskPricing[selPlan] || 0;
  };

  const bookPlan = () => {
    if (!selPlan) return;
    if (selPlan === "hourly" && bookHours < 1) return;

    const amount = getAmount();
    const label = selPlan === "hourly" ? `Hourly (${bookHours}h)` : selPlan === "daily" ? "Daily" : "Monthly";

    const commitBooking = () => {
      const id = "b" + Date.now();
      const start = new Date(bookDate);
      const days = selPlan === "monthly" ? 30 : 1;
      const end = new Date(start); end.setDate(end.getDate() + days);
      const endStr = end.toISOString().split("T")[0];
      const booking = {
        id, userId: user.id, service: "hot_desk", plan: selPlan,
        date: bookDate,
        ...(selPlan === "monthly" ? { endDate: endStr } : {}),
        ...(selPlan === "hourly" ? { hours: bookHours } : {}),
        amount, status: "pending", invoiceId: null,
        paymentMethod: payMethod === "bank" ? "bank" : "paystack",
        description: `Hot Desk ${label}${selPlan === "hourly" ? ` on ${bookDate}` : selPlan === "monthly" ? ` from ${bookDate} to ${endStr}` : ` on ${bookDate}`}`,
      };
      setData(d => {
        const es = d.emailSettings || {};
        if (es.enableBookingConfirmation !== false) {
          const params = buildEmailParams.bookingConfirmation({ user, booking, amount, service: "Hot Desk", plan: label });
          sendZeptoMail({ templateParams: params });
          const logEntry = { id: "el" + Date.now(), type: "booking_confirmation", to: user.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
          return { ...d, bookings: [...d.bookings, booking], emailSettings: { ...es, emailLog: [...(es.emailLog || []), logEntry] } };
        }
        return { ...d, bookings: [...d.bookings, booking] };
      });
      setPaying(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    };

    if (payMethod === "paystack") {
      const key = data.paymentMethods?.paystackKey;
      if (!key || !key.startsWith("pk_")) { alert("Paystack key not configured. Please contact the admin."); return; }
      openPaystackCheckout({
        key, email: user.email, amount, name: user.name,
        onOpen: () => setPsOpening(true),
        onSuccess: () => { setPsOpening(false); setPaying(true); commitBooking(); },
        onClose: () => setPsOpening(false),
      });
    } else {
      setPaying(true);
      setTimeout(commitBooking, 1200);
    }
  };

  const wifiCard = (
    <div style={{ background: BRAND.lightBlue, border: `2px solid ${BRAND.blue}44`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon name="wifi" size={20} color={BRAND.blue} />
        <span style={{ fontWeight: 800, color: BRAND.blue, fontSize: 14 }}>WiFi Access</span>
        <span style={{ marginLeft: "auto", background: "#DCFCE7", color: "#16A34A", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>ACTIVE</span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Network Name</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{data.wifi.ssid}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Password</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#111", letterSpacing: "0.06em", background: "#fff", borderRadius: 6, padding: "6px 10px", display: "inline-block" }}>{data.wifi.password}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: BRAND.red }} />
        <span style={{ fontSize: 11, color: "#6B7280" }}>Do not share this password</span>
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>🪑 Hot Desk</h2>
      <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13 }}>Flexible workspace. Select a plan, pay, and await admin approval.</p>

      {/* Admin-approved: show WiFi card */}
      {approvedToday && (
        <div style={{ marginBottom: 20, maxWidth: 420 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#16A34A", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="check" size={14} color="#16A34A" /> Booking approved — enjoy your workspace!
          </div>
          {wifiCard}
        </div>
      )}

      {/* Submission success banner */}
      {submitted && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "14px 16px", marginBottom: 20, maxWidth: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: payMethod === "bank" ? 12 : 0 }}>
            <Icon name="check" size={18} color="#16A34A" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>Booking submitted!</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                {payMethod === "bank"
                  ? "Transfer the amount below to complete your booking. Admin will confirm once payment is received."
                  : "Awaiting admin approval. WiFi details will appear once approved."}
              </div>
            </div>
          </div>
          {payMethod === "bank" && (() => {
            const bd = data.paymentMethods?.bankDetails || {};
            return (
              <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #BBF7D0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.bankName || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#111", letterSpacing: "0.08em" }}>{bd.accountNumber || "—"}</div>
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.accountName || "—"}</div>
                  </div>
                </div>
                <div style={{ background: BRAND.lightOrange, borderRadius: 6, padding: "7px 10px", fontSize: 11, color: BRAND.orange }}>
                  Use your <strong>name + invoice amount</strong> as payment reference. Send proof to the front desk.
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Plan selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 720, marginBottom: 24 }}>
        {HOT_DESK_PLANS.map(plan => (
          <div key={plan.id} onClick={() => setSelPlan(plan.id)}
            style={{ background: "#fff", border: `2px solid ${selPlan === plan.id ? BRAND.blue : "#E5E7EB"}`, borderRadius: 12, padding: "16px 14px", cursor: "pointer", transition: "border-color .2s" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: selPlan === plan.id ? BRAND.blue : "#111", marginBottom: 2 }}>{plan.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: BRAND.blue, marginBottom: 4 }}>
              {formatNGN(data.hotDeskPricing[plan.id])}
              <span style={{ fontSize: 11, fontWeight: 500, color: "#9CA3AF" }}>{plan.id === "hourly" ? "/hr" : plan.id === "daily" ? "/day" : "/mo"}</span>
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{plan.desc}</div>
            {selPlan === plan.id && <div style={{ marginTop: 8, width: "100%", height: 3, borderRadius: 2, background: BRAND.blue }} />}
          </div>
        ))}
      </div>

      {/* Booking form — same pattern for all 3 plans */}
      {selPlan && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 24, maxWidth: 420, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.blue, marginBottom: 16 }}>
            {selPlan === "hourly" ? "Hourly Booking" : selPlan === "daily" ? "Daily Pass" : "Monthly Membership"}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
              {selPlan === "monthly" ? "Start Date" : "Date"}
            </label>
            <input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
          </div>

          {selPlan === "hourly" && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Number of Hours</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setBookHours(h => Math.max(1, h - 1))} style={{ width: 34, height: 34, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <span style={{ fontSize: 18, fontWeight: 800, color: BRAND.blue, minWidth: 32, textAlign: "center" }}>{bookHours}</span>
                <button onClick={() => setBookHours(h => Math.min(12, h + 1))} style={{ width: 34, height: 34, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>hours (max 12)</span>
              </div>
            </div>
          )}

          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            {selPlan === "hourly" && (
              <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>{bookHours} hr × {formatNGN(data.hotDeskPricing.hourly)}/hr</div>
            )}
            {selPlan === "daily" && (
              <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>Full day — 9am to 5pm</div>
            )}
            {selPlan === "monthly" && (
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>
                Expires: {(() => { const d = new Date(bookDate); d.setDate(d.getDate() + 30); return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); })()}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #E5E7EB" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.blue }}>{formatNGN(getAmount())}</span>
            </div>
          </div>

          <div style={{ background: BRAND.lightOrange, borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 12, color: BRAND.orange }}>
            ⏳ After payment, admin will confirm your booking. WiFi details appear on your dashboard once approved.
          </div>

          <PaymentSelector paymentMethods={data.paymentMethods} amount={getAmount()} selected={payMethod} onChange={setPayMethod} paying={paying || psOpening} />

          <button onClick={bookPlan} disabled={paying || psOpening || !payMethod}
            style={{ width: "100%", padding: "12px", background: paying || psOpening || !payMethod ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: paying || psOpening || !payMethod ? "not-allowed" : "pointer" }}>
            {paying ? "Saving..." : psOpening ? "Opening Paystack..." : `Submit — ${formatNGN(getAmount())}`}
          </button>
        </div>
      )}

      {!selPlan && (
        <div style={{ background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 12, padding: 24, maxWidth: 720, marginBottom: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
          Select a plan above to get started
        </div>
      )}

      {/* Booking history */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, maxWidth: 720 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#374151" }}>My Bookings</h3>
        {myBookings.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 13, margin: 0 }}>No bookings yet.</p>
        ) : myBookings.map(b => {
          const planLabel = HOT_DESK_PLANS.find(p => p.id === b.plan)?.label || b.plan;
          return (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {formatDate(b.date)}{" "}
                  <span style={{ fontSize: 11, background: BRAND.lightBlue, color: BRAND.blue, borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>{planLabel}</span>
                  {b.status === "approved" && <span style={{ fontSize: 11, background: "#DCFCE7", color: "#16A34A", borderRadius: 4, padding: "1px 6px", fontWeight: 700, marginLeft: 4 }}>✓ WiFi Ready</span>}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {b.plan === "hourly" ? `${b.hours}h booked` : b.plan === "monthly" ? `Until ${formatDate(b.endDate)}` : "Full day (9am–5pm)"}
                </div>
              </div>
              <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(b.amount)}</div>
                <Badge status={b.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── PRIVATE OFFICE ──────────────────────────────────────────────────────────
const MEETING_PLANS = [
  { id: "hourly",  label: "Hourly",   hours: 1,  desc: "Per hour"        },
  { id: "halfDay", label: "Half Day", hours: 4,  desc: "4 hours (9am–1pm or 1pm–5pm)" },
  { id: "fullDay", label: "Full Day", hours: 8,  desc: "8 hours (9am–5pm)" },
];

const PLAN_TIERS = [
  { id: "daily",     label: "Daily",     days: 1   },
  { id: "monthly",   label: "Monthly",   days: 30  },
  { id: "quarterly", label: "Quarterly", days: 90  },
  { id: "yearly",    label: "Yearly",    days: 365 },
];

const PrivateOfficeView = ({ user, data, setData }) => {
  const [selectedOffice, setSelectedOffice] = useState(null);
  const [selectedPlan, setSelectedPlan]   = useState(null);
  const [modal, setModal]   = useState(false);
  const [paying, setPaying] = useState(false);
  const [psOpening, setPsOpening] = useState(false);
  const [payMethod, setPayMethod] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  const myActiveSub    = data.subscriptions.find(s => s.userId === user.id && s.service === "private_office" && s.status === "active");
  const availableOffices = data.offices.filter(o => o.status === "available");

  // When user picks an office, open the plan-selector modal
  const openPlans = (officeId) => { setSelectedOffice(officeId); setSelectedPlan(null); setModal(true); };

  const selectedOfficeObj = data.offices.find(o => o.id === selectedOffice);
  const planPrice = selectedOfficeObj && selectedPlan ? selectedOfficeObj.pricing[selectedPlan] : 0;
  const planObj   = PLAN_TIERS.find(p => p.id === selectedPlan);

  const subscribe = () => {
    if (!selectedPlan || !selectedOffice) return;
    const isBankTransfer = payMethod === "bank";

    const commitSubscription = () => {
      const start = new Date();
      const end   = new Date(start); end.setDate(end.getDate() + planObj.days);
      const subId = "s" + Date.now();
      const invId = "inv" + Date.now();
      const newSub = {
        id: subId, userId: user.id, service: "private_office",
        plan: selectedPlan,
        startDate: start.toISOString().split("T")[0],
        endDate:   end.toISOString().split("T")[0],
        status: isBankTransfer ? "pending_transfer" : "active",
        officeId: selectedOffice, amount: planPrice,
        paymentMethod: payMethod, paymentConfirmed: !isBankTransfer,
      };
      setData(d => {
        const es = d.emailSettings || {};
        if (!isBankTransfer && es.enableSubscriptionActivated !== false) {
          const params = buildEmailParams.subscriptionActivated({ user, sub: newSub, officeName: selectedOfficeObj?.name });
          sendZeptoMail({ templateParams: params });
          const logEntry = { id: "el" + Date.now(), type: "subscription_activated", to: user.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
          return {
            ...d,
            subscriptions: [...d.subscriptions, newSub],
            offices: d.offices.map(o => o.id === selectedOffice ? { ...o, status: "occupied", assignedTo: user.id } : o),
            invoices: [...d.invoices, { id: invId, userId: user.id, amount: planPrice, date: start.toISOString().split("T")[0], status: "paid", service: "Private Office", description: `${selectedOfficeObj.name} – ${planObj.label}` }],
            emailSettings: { ...es, emailLog: [...(es.emailLog || []), logEntry] },
          };
        }
        return {
          ...d,
          subscriptions: [...d.subscriptions, newSub],
          offices: isBankTransfer ? d.offices : d.offices.map(o => o.id === selectedOffice ? { ...o, status: "occupied", assignedTo: user.id } : o),
          invoices: [...d.invoices, { id: invId, userId: user.id, amount: planPrice, date: start.toISOString().split("T")[0], status: isBankTransfer ? "unpaid" : "paid", service: "Private Office", description: `${selectedOfficeObj.name} – ${planObj.label}` }],
        };
      });
      setPaying(false); setModal(false);
      setSuccessMsg(isBankTransfer ? "⏳ Bank transfer submitted! Your office will be activated once admin confirms payment." : "✅ Subscription active! Office assigned successfully.");
      setTimeout(() => setSuccessMsg(""), 5000);
    };

    if (!isBankTransfer) {
      const key = data.paymentMethods?.paystackKey;
      if (!key || !key.startsWith("pk_")) { alert("Paystack key not configured. Please contact the admin."); return; }
      openPaystackCheckout({
        key, email: user.email, amount: planPrice, name: user.name,
        onOpen: () => setPsOpening(true),
        onSuccess: () => { setPsOpening(false); setPaying(true); commitSubscription(); },
        onClose: () => setPsOpening(false),
      });
    } else {
      setPaying(true);
      setTimeout(commitSubscription, 1500);
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>🏢 Private Offices</h2>
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>Each office has its own pricing. Select an office to view rates and subscribe.</p>

      {successMsg && (() => {
        const isBankDone = successMsg.startsWith("⏳");
        const bd = data.paymentMethods?.bankDetails || {};
        return (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "14px 16px", marginBottom: 20, maxWidth: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isBankDone ? 12 : 0 }}>
              <Icon name="check" size={18} color="#16A34A" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>{successMsg}</span>
            </div>
            {isBankDone && (
              <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #BBF7D0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.bankName || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div><div style={{ fontSize: 13, fontWeight: 800, color: "#111", letterSpacing: "0.08em" }}>{bd.accountNumber || "—"}</div></div>
                  <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.accountName || "—"}</div></div>
                </div>
                <div style={{ background: BRAND.lightOrange, borderRadius: 6, padding: "7px 10px", fontSize: 11, color: BRAND.orange }}>
                  Use your <strong>name + invoice amount</strong> as payment reference. Send proof to the front desk.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {myActiveSub && (() => {
        const office = data.offices.find(o => o.id === myActiveSub.officeId);
        return (
          <div style={{ background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.darkBlue})`, borderRadius: 14, padding: "20px 24px", color: "#fff", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#93C5FD", marginBottom: 6 }}>YOUR ACTIVE OFFICE</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{office?.name}</div>
            <div style={{ fontSize: 13, color: "#BFDBFE", marginTop: 4 }}>{office?.floor} · Capacity {office?.capacity} · {myActiveSub.plan} plan</div>
            <div style={{ display: "flex", gap: 20, marginTop: 14 }}>
              <div><div style={{ fontSize: 11, color: "#93C5FD" }}>Start</div><div style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(myActiveSub.startDate)}</div></div>
              <div><div style={{ fontSize: 11, color: "#93C5FD" }}>Expires</div><div style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(myActiveSub.endDate)}</div></div>
              <div><div style={{ fontSize: 11, color: "#93C5FD" }}>Days Left</div><div style={{ fontSize: 13, fontWeight: 600, color: daysLeft(myActiveSub.endDate) <= 7 ? "#FCA5A5" : "#86EFAC" }}>{daysLeft(myActiveSub.endDate)}</div></div>
            </div>
          </div>
        );
      })()}

      {/* Office cards — each shows its own pricing */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
        {data.offices.map(office => {
          const isAvail = office.status === "available";
          return (
            <div key={office.id} style={{ background: "#fff", border: `2px solid ${isAvail ? BRAND.blue + "22" : "#E5E7EB"}`, borderRadius: 14, overflow: "hidden", opacity: isAvail ? 1 : 0.75 }}>
              <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.blue }}>{office.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{office.floor} · Capacity {office.capacity}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: isAvail ? "#DCFCE7" : "#FEE2E2", color: isAvail ? "#16A34A" : "#DC2626" }}>
                  {isAvail ? "Available" : "Occupied"}
                </span>
              </div>
              <div style={{ padding: "12px 18px" }}>
                {PLAN_TIERS.map((tier, i) => (
                  <div key={tier.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < PLAN_TIERS.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{tier.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{formatNGN(office.pricing[tier.id])}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "0 18px 16px" }}>
                <button
                  disabled={!isAvail}
                  onClick={() => openPlans(office.id)}
                  style={{ width: "100%", padding: "9px", background: isAvail ? BRAND.blue : "#E5E7EB", color: isAvail ? "#fff" : "#9CA3AF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isAvail ? "pointer" : "not-allowed" }}
                >
                  {isAvail ? "Select Plan & Subscribe" : "Not Available"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Plan selector modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={`Subscribe — ${selectedOfficeObj?.name}`}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>{selectedOfficeObj?.floor} · Capacity {selectedOfficeObj?.capacity}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10, marginTop: 12 }}>Choose a Plan</div>
          {PLAN_TIERS.map(tier => (
            <div key={tier.id} onClick={() => setSelectedPlan(tier.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `2px solid ${selectedPlan === tier.id ? BRAND.blue : "#E5E7EB"}`, borderRadius: 8, padding: "11px 14px", marginBottom: 8, cursor: "pointer", background: selectedPlan === tier.id ? BRAND.lightBlue : "#fff" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: BRAND.blue }}>{tier.label}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{tier.days} day{tier.days > 1 ? "s" : ""}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#111" }}>{formatNGN(selectedOfficeObj?.pricing[tier.id] || 0)}</div>
            </div>
          ))}
        </div>
        {selectedPlan && (
          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Selected plan</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginTop: 4 }}>Total: {formatNGN(planPrice)}</div>
          </div>
        )}
        <PaymentSelector paymentMethods={data.paymentMethods} amount={planPrice} selected={payMethod} onChange={setPayMethod} paying={paying || psOpening} />
        <button onClick={subscribe} disabled={paying || psOpening || !selectedPlan || !payMethod}
          style={{ width: "100%", padding: "12px", background: paying || psOpening || !selectedPlan || !payMethod ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: paying || psOpening || !selectedPlan || !payMethod ? "not-allowed" : "pointer" }}>
          {paying ? "Saving..." : psOpening ? "Opening Paystack..." : "Pay & Subscribe"}
        </button>
      </Modal>
    </div>
  );
};

// ─── MEETING ROOMS ───────────────────────────────────────────────────────────
const MeetingRoomView = ({ user, data, setData }) => {
  const room = data.meetingRooms[0];
  const [selPlan, setSelPlan]     = useState(null);
  const [date, setDate]           = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime]     = useState("10:00");
  const [modal, setModal]         = useState(false);
  const [booking, setBooking]     = useState(false);
  const [psOpening, setPsOpening] = useState(false);
  const [payMethod, setPayMethod] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [lastPayMethod, setLastPayMethod] = useState(null);

  // For hourly: parse start/end into total minutes, ceil to next full hour
  const toMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const hourlyBillableHours = () => {
    const diff = toMins(endTime) - toMins(startTime);
    if (diff <= 0) return 0;
    return Math.ceil(diff / 60); // any extra minute = full extra hour
  };

  const billableHours = selPlan === "hourly" ? hourlyBillableHours() : (selPlan ? MEETING_PLANS.find(p => p.id === selPlan)?.hours : 0);
  const amount = selPlan === "hourly"
    ? billableHours * room.pricing.hourly
    : selPlan ? room.pricing[selPlan] : 0;

  const formatTime = t => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const endTimeMin = () => {
    const [h, m] = startTime.split(":").map(Number);
    const next = h * 60 + m + 1;
    return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
  };

  const book = () => {
    if (!selPlan || (selPlan === "hourly" && billableHours <= 0)) return;
    const isBankTransfer = payMethod === "bank";
    const timeNote = selPlan === "hourly" ? `${formatTime(startTime)} – ${formatTime(endTime)}` : "";

    const commitBooking = () => {
      const id = "b" + Date.now();
      setData(d => ({
        ...d,
        bookings: [...d.bookings, {
          id, userId: user.id, service: "meeting_room", roomId: room.id,
          date, plan: selPlan,
          startTime: selPlan === "hourly" ? startTime : null,
          endTime:   selPlan === "hourly" ? endTime   : null,
          hours: billableHours, amount, status: "pending", invoiceId: null,
          paymentMethod: isBankTransfer ? "bank" : "paystack",
          timeNote,
        }],
      }));
      setBooking(false); setModal(false); setSelPlan(null);
      setLastPayMethod(payMethod);
      setBookingSuccess(true);
      setTimeout(() => setBookingSuccess(false), 4000);
    };

    if (!isBankTransfer) {
      const key = data.paymentMethods?.paystackKey;
      if (!key || !key.startsWith("pk_")) { alert("Paystack key not configured. Please contact the admin."); return; }
      openPaystackCheckout({
        key, email: user.email, amount, name: user.name,
        onOpen: () => setPsOpening(true),
        onSuccess: () => { setPsOpening(false); setBooking(true); commitBooking(); },
        onClose: () => setPsOpening(false),
      });
    } else {
      setBooking(true);
      setTimeout(commitBooking, 1000);
    }
  };

  const myBookings = data.bookings.filter(b => b.userId === user.id && b.service === "meeting_room");

  // Live breakdown for hourly display
  const rawMins   = toMins(endTime) - toMins(startTime);
  const fullHours = Math.floor(rawMins / 60);
  const extraMins = rawMins % 60;

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>🎯 Meeting Room</h2>
      {bookingSuccess && (() => {
        const bd = data.paymentMethods?.bankDetails || {};
        const isBankDone = lastPayMethod === "bank";
        return (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "14px 16px", marginBottom: 20, maxWidth: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isBankDone ? 12 : 0 }}>
              <Icon name="check" size={18} color="#16A34A" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>Booking submitted!</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  {isBankDone ? "Transfer the amount below to complete your booking. Admin confirms once payment is received." : "Awaiting admin approval."}
                </div>
              </div>
            </div>
            {isBankDone && (
              <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #BBF7D0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.bankName || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div><div style={{ fontSize: 13, fontWeight: 800, color: "#111", letterSpacing: "0.08em" }}>{bd.accountNumber || "—"}</div></div>
                  <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.accountName || "—"}</div></div>
                </div>
                <div style={{ background: BRAND.lightOrange, borderRadius: 6, padding: "7px 10px", fontSize: 11, color: BRAND.orange }}>
                  Use your <strong>name + invoice amount</strong> as payment reference. Send proof to the front desk.
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>Book our professional meeting space — choose hourly, half-day, or full-day.</p>

      {/* Room card */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden", marginBottom: 24, maxWidth: 520 }}>
        <div style={{ background: `linear-gradient(135deg, ${BRAND.orange}22, ${BRAND.orange}08)`, padding: "22px 24px 18px", borderBottom: "1px solid #F3F4F6" }}>
          <Icon name="meeting" size={32} color={BRAND.orange} />
          <div style={{ fontSize: 20, fontWeight: 800, color: "#111", marginTop: 10 }}>{room.name}</div>
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{room.floor} · {room.capacity} people</div>
        </div>
        <div style={{ padding: "18px 24px" }}>
          {MEETING_PLANS.map((plan, i) => (
            <div key={plan.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < MEETING_PLANS.length - 1 ? "1px solid #F9FAFB" : "none" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{plan.label}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{plan.id === "hourly" ? `${formatNGN(room.pricing.hourly)}/hr — billed per hour (any extra minute = +1 hr)` : plan.desc}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.blue }}>{formatNGN(room.pricing[plan.id])}</div>
            </div>
          ))}
          <button onClick={() => setModal(true)} style={{ width: "100%", marginTop: 16, padding: "10px", background: BRAND.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Book Now
          </button>
        </div>
      </div>

      {/* My bookings */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>My Bookings</h3>
        {myBookings.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>No bookings yet.</div>}
        {myBookings.map(b => {
          const mp = MEETING_PLANS.find(p => p.id === b.plan);
          return (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{room.name} — {mp?.label || b.plan}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {formatDate(b.date)}
                  {b.timeNote ? ` · ${b.timeNote} · ${b.hours} hr${b.hours !== 1 ? "s" : ""} billed` : ` · ${mp?.desc || ""}`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(b.amount)}</div>
                <Badge status={b.status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Booking modal */}
      <Modal open={modal} onClose={() => { setModal(false); setSelPlan(null); }} title="Book Meeting Room">
        <div style={{ background: BRAND.lightOrange, borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, color: BRAND.orange }}>{room.name}</div>
          <div style={{ fontSize: 12, color: "#9CA3AF" }}>{room.floor} · {room.capacity} people</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #E5E7EB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>Select Plan</label>
          {MEETING_PLANS.map(plan => (
            <div key={plan.id} onClick={() => setSelPlan(plan.id)}
              style={{ border: `2px solid ${selPlan === plan.id ? BRAND.orange : "#E5E7EB"}`, borderRadius: 8, padding: "11px 14px", marginBottom: 8, cursor: "pointer", background: selPlan === plan.id ? BRAND.lightOrange : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: selPlan === plan.id ? BRAND.orange : "#111" }}>{plan.label}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{plan.desc}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.orange }}>{formatNGN(room.pricing[plan.id])}<span style={{ fontSize: 10, fontWeight: 500, color: "#9CA3AF" }}>{plan.id === "hourly" ? "/hr" : ""}</span></div>
              </div>

              {/* Time picker — only visible when hourly is selected */}
              {selPlan === "hourly" && plan.id === "hourly" && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #FED7AA" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Start Time</label>
                      <input type="time" value={startTime}
                        onChange={e => { setStartTime(e.target.value); if (toMins(endTime) <= toMins(e.target.value)) setEndTime(endTimeMin()); }}
                        style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #E5E7EB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>End Time</label>
                      <input type="time" value={endTime} min={endTimeMin()}
                        onChange={e => setEndTime(e.target.value)}
                        style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #E5E7EB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                  </div>

                  {/* Live billing breakdown */}
                  {rawMins > 0 && (
                    <div style={{ background: "#fff", border: "1px solid #FED7AA", borderRadius: 7, padding: "10px 12px", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6B7280" }}>Duration</span>
                        <span style={{ fontWeight: 600 }}>
                          {fullHours > 0 ? `${fullHours}h ` : ""}{extraMins > 0 ? `${extraMins}min` : ""}
                        </span>
                      </div>
                      {extraMins > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: BRAND.orange }}>
                          <span>+{extraMins} min extra → billed as +1 hr</span>
                          <span style={{ fontWeight: 700 }}>+{formatNGN(room.pricing.hourly)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #FED7AA", paddingTop: 6, marginTop: 4 }}>
                        <span style={{ fontWeight: 700 }}>Billed: {billableHours} hr{billableHours !== 1 ? "s" : ""}</span>
                        <span style={{ fontWeight: 800, color: BRAND.orange }}>{formatNGN(amount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {selPlan && selPlan !== "hourly" && (
          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.orange }}>{formatNGN(amount)}</span>
            </div>
          </div>
        )}

        <PaymentSelector paymentMethods={data.paymentMethods} amount={amount} selected={payMethod} onChange={setPayMethod} paying={booking || psOpening} />
        <button onClick={book} disabled={booking || psOpening || !selPlan || (selPlan === "hourly" && billableHours <= 0) || !payMethod}
          style={{ width: "100%", padding: "12px", background: booking || psOpening || !selPlan || (selPlan === "hourly" && billableHours <= 0) || !payMethod ? "#9CA3AF" : BRAND.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {booking ? "Saving..." : psOpening ? "Opening Paystack..." : selPlan === "hourly" && billableHours > 0 ? `Submit — ${formatNGN(amount)} (${billableHours} hr${billableHours !== 1 ? "s" : ""})` : "Submit Booking Request"}
        </button>
      </Modal>
    </div>
  );
};

// ─── VIRTUAL OFFICE ──────────────────────────────────────────────────────────
// Plans that qualify a private_office or hot_desk subscriber for complimentary utility bill access
const QUALIFYING_PLANS = ["monthly", "quarterly", "yearly"];

const VirtualOfficeView = ({ user, data, setData }) => {
  const [modal, setModal] = useState(false);
  const [selPlan, setSelPlan] = useState(null);
  const [paying, setPaying] = useState(false);
  const [psOpening, setPsOpening] = useState(false);
  const [payMethod, setPayMethod] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [lastPayMethod, setLastPayMethod] = useState(null);
  const [utilReqModal, setUtilReqModal] = useState(false);
  const [reqSubmitted, setReqSubmitted] = useState(false);

  const myActiveSub = data.subscriptions.find(s => s.userId === user.id && s.service === "virtual_office" && s.status === "active");

  // Complimentary access: active private_office or hot_desk sub on monthly plan or above
  const qualifyingSub = data.subscriptions.find(s =>
    s.userId === user.id &&
    s.status === "active" &&
    (s.service === "private_office" || s.service === "hot_desk") &&
    ["monthly", "quarterly", "yearly"].includes(s.plan)
  );
  // True if member gets the utility bill perk without a paid virtual office sub
  const hasComplimentaryAccess = !myActiveSub && !!qualifyingSub;

  // Document data
  const myCert = data.virtualDocs?.certificates?.[user.id];
  const utilBill = data.virtualDocs?.utilityBill;
  const daysSinceUtil = utilBill ? Math.floor((new Date() - new Date(utilBill.uploadedAt)) / 86400000) : null;
  const utilIsRecent = utilBill && daysSinceUtil <= 30;

  // Check if user already has a pending utility request
  const myPendingReq = (data.virtualDocs?.utilityRequests || []).find(r => r.userId === user.id && r.status === "pending");

  const subscribe = () => {
    if (!selPlan) return;
    const plan = data.plans.virtual_office.find(p => p.id === selPlan);
    const isBankTransfer = payMethod === "bank";

    const commitSubscription = () => {
      const start = new Date();
      const end = new Date(start); end.setDate(end.getDate() + plan.days);
      const subId = "s" + Date.now();
      const newSub = { id: subId, userId: user.id, service: "virtual_office", plan: selPlan, startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0], status: isBankTransfer ? "pending_transfer" : "active", amount: plan.price, paymentMethod: payMethod, paymentConfirmed: !isBankTransfer };
      setData(d => {
        const es = d.emailSettings || {};
        if (!isBankTransfer && es.enableSubscriptionActivated !== false) {
          const params = buildEmailParams.subscriptionActivated({ user, sub: newSub });
          sendZeptoMail({ templateParams: params });
          const logEntry = { id: "el" + Date.now(), type: "subscription_activated", to: user.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
          return {
            ...d,
            subscriptions: [...d.subscriptions, newSub],
            invoices: [...d.invoices, { id: "inv" + Date.now(), userId: user.id, amount: plan.price, date: start.toISOString().split("T")[0], status: "paid", service: "Virtual Office", description: `Virtual Office - ${plan.label}` }],
            emailSettings: { ...es, emailLog: [...(es.emailLog || []), logEntry] },
          };
        }
        return {
          ...d,
          subscriptions: [...d.subscriptions, newSub],
          invoices: [...d.invoices, { id: "inv" + Date.now(), userId: user.id, amount: plan.price, date: start.toISOString().split("T")[0], status: isBankTransfer ? "unpaid" : "paid", service: "Virtual Office", description: `Virtual Office - ${plan.label}` }],
        };
      });
      setPaying(false); setModal(false);
      setLastPayMethod(payMethod);
      setSuccessMsg(isBankTransfer ? "⏳ Bank transfer submitted! Your subscription will activate once admin confirms payment." : "✅ Subscription active! Welcome to Virtual Office.");
      setTimeout(() => setSuccessMsg(""), 8000);
    };

    if (!isBankTransfer) {
      const key = data.paymentMethods?.paystackKey;
      if (!key || !key.startsWith("pk_")) { alert("Paystack key not configured. Please contact the admin."); return; }
      openPaystackCheckout({
        key, email: user.email, amount: plan.price, name: user.name,
        onOpen: () => setPsOpening(true),
        onSuccess: () => { setPsOpening(false); setPaying(true); commitSubscription(); },
        onClose: () => setPsOpening(false),
      });
    } else {
      setPaying(true);
      setTimeout(commitSubscription, 1500);
    }
  };

  const submitUtilRequest = () => {
    if (myPendingReq) return;
    setData(d => ({
      ...d,
      virtualDocs: {
        ...d.virtualDocs,
        utilityRequests: [
          ...(d.virtualDocs?.utilityRequests || []),
          { id: "ureq" + Date.now(), userId: user.id, requestedAt: new Date().toISOString(), status: "pending" },
        ],
      },
    }));
    setReqSubmitted(true);
    setUtilReqModal(false);
  };

  // ── Utility bill card (reused in both full subscriber and complimentary views) ──
  const UtilityBillCard = () => (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon name="invoice" size={16} color={BRAND.orange} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Utility Bill</span>
      </div>

      {utilIsRecent ? (
        <>
          <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>✓ Available for download</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Uploaded {daysSinceUtil === 0 ? "today" : `${daysSinceUtil} day${daysSinceUtil !== 1 ? "s" : ""} ago`}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>Bills uploaded within 30 days are available instantly.</div>
          </div>
          <a href={utilBill.dataUrl} download={utilBill.fileName} style={{ width: "100%", padding: "9px", background: BRAND.orange, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", boxSizing: "border-box" }}>
            <Icon name="download" size={14} color="#fff" /> Download Utility Bill
          </a>
        </>
      ) : utilBill && daysSinceUtil > 30 ? (
        <>
          <div style={{ background: "#FFF7ED", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange }}>⚠ Bill is {daysSinceUtil} days old</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Bills older than 30 days require a new request. Hub43 will issue a fresh bill within 3–5 business days.</div>
          </div>
          {myPendingReq ? (
            <button disabled style={{ width: "100%", padding: "9px", background: "#E5E7EB", color: "#6B7280", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "not-allowed" }}>Request Pending…</button>
          ) : (
            <button onClick={() => setUtilReqModal(true)} style={{ width: "100%", padding: "9px", background: BRAND.orange, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="invoice" size={14} color="#fff" /> Request New Utility Bill
            </button>
          )}
        </>
      ) : (
        <>
          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>No bill on file yet</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Submit a request and the Hub43 team will prepare one within 3–5 business days.</div>
          </div>
          {myPendingReq ? (
            <button disabled style={{ width: "100%", padding: "9px", background: "#E5E7EB", color: "#6B7280", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "not-allowed" }}>Request Pending…</button>
          ) : (
            <button onClick={() => setUtilReqModal(true)} style={{ width: "100%", padding: "9px", background: BRAND.orange, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="invoice" size={14} color="#fff" /> Request Utility Bill
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>🌍 Virtual Office</h2>
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>Professional business address and digital office services.</p>

      {successMsg && (() => {
        const isBankDone = lastPayMethod === "bank";
        const bd = data.paymentMethods?.bankDetails || {};
        return (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "14px 16px", marginBottom: 20, maxWidth: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isBankDone ? 12 : 0 }}>
              <Icon name="check" size={18} color="#16A34A" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>{successMsg}</span>
            </div>
            {isBankDone && (
              <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #BBF7D0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.bankName || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div><div style={{ fontSize: 13, fontWeight: 800, color: "#111", letterSpacing: "0.08em" }}>{bd.accountNumber || "—"}</div></div>
                  <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.accountName || "—"}</div></div>
                </div>
                <div style={{ background: BRAND.lightOrange, borderRadius: 6, padding: "7px 10px", fontSize: 11, color: BRAND.orange }}>
                  Use your <strong>name + invoice amount</strong> as payment reference. Send proof to the front desk.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── COMPLIMENTARY ACCESS: utility bill only ── */}
      {hasComplimentaryAccess ? (
        <div>
          {/* Perk banner */}
          <div style={{ background: `linear-gradient(135deg, #059669, #047857)`, borderRadius: 14, padding: "18px 24px", color: "#fff", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>🎁</div>
            <div>
              <div style={{ fontSize: 12, color: "#A7F3D0", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Complimentary Perk</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Utility Bill Access Included</div>
              <div style={{ fontSize: 13, color: "#D1FAE5", lineHeight: 1.5 }}>
                Your <strong style={{ color: "#fff" }}>{qualifyingSub.service.replace(/_/g," ")} ({qualifyingSub.plan}) </strong>
                subscription includes complimentary utility bill access. Download or request a utility bill below — no additional charge.
              </div>
            </div>
          </div>

          {reqSubmitted && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="check" size={16} color="#16A34A" />
              <div style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>Utility bill request submitted! Hub43 team will process it within 3–5 business days.</div>
            </div>
          )}

          <div style={{ maxWidth: 400 }}>
            <UtilityBillCard />
          </div>

          {/* Upsell nudge */}
          <div style={{ marginTop: 24, background: BRAND.lightBlue, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, maxWidth: 600 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue, marginBottom: 4 }}>Want the full Virtual Office?</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>Upgrade to get a registered business address, mail handling, certificate of registration, and more.</div>
            </div>
            <button onClick={() => setModal(true)} style={{ padding: "9px 18px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              Upgrade
            </button>
          </div>
        </div>

      ) : !myActiveSub ? (
        /* ── NOT SUBSCRIBED: show plans ── */
        <>
          <div style={{ background: BRAND.lightBlue, borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: BRAND.blue }}>What's Included</h3>
            {["Professional Lagos business address", "Mail handling & forwarding", "Certificate of Registration (uploaded by admin)", "Utility bill — instant download or request service", "Business credibility boost"].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <Icon name="check" size={14} color="#16A34A" />
                <span style={{ fontSize: 13, color: "#374151" }}>{f}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 500 }}>
            {data.plans.virtual_office.map(plan => (
              <div key={plan.id} style={{ background: "#fff", border: "2px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.blue }}>{plan.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#111", marginTop: 4 }}>{formatNGN(plan.price)}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 14 }}>{plan.days} days</div>
                <button onClick={() => { setSelPlan(plan.id); setModal(true); }} style={{ width: "100%", padding: "9px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Subscribe
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ── FULL SUBSCRIBER ── */
        <div>
          {/* Active subscription banner */}
          <div style={{ background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.darkBlue})`, borderRadius: 14, padding: "20px 24px", color: "#fff", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#93C5FD" }}>VIRTUAL OFFICE ACTIVE</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>43 Balogun Street, Lagos Island, Lagos</div>
            <div style={{ fontSize: 13, color: "#BFDBFE", marginTop: 4 }}>{myActiveSub.plan} plan · {daysLeft(myActiveSub.endDate)} days left</div>
          </div>

          {reqSubmitted && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="check" size={16} color="#16A34A" />
              <div style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>Utility bill request submitted! Hub43 team will process it within 3–5 business days.</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>

            {/* ── Certificate of Registration ── */}
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon name="invoice" size={16} color={BRAND.blue} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Certificate of Registration</span>
              </div>
              {myCert ? (
                <>
                  <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>✓ Certificate ready</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{myCert.fileName}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>Uploaded {new Date(myCert.uploadedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</div>
                  </div>
                  <a href={myCert.dataUrl} download={myCert.fileName} style={{ width: "100%", padding: "9px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", boxSizing: "border-box" }}>
                    <Icon name="download" size={14} color="#fff" /> Download Certificate
                  </a>
                </>
              ) : (
                <>
                  <div style={{ background: "#FFFBEB", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.orange }}>⏳ Not yet uploaded</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>The Hub43 admin is preparing your certificate. You'll be notified once it's ready.</div>
                  </div>
                  <button disabled style={{ width: "100%", padding: "9px", background: "#E5E7EB", color: "#9CA3AF", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "not-allowed" }}>
                    Awaiting Upload
                  </button>
                </>
              )}
            </div>

            {/* ── Utility Bill ── */}
            <UtilityBillCard />
          </div>
        </div>
      )}

      {/* Subscribe modal */}
      <Modal open={modal} onClose={() => { setModal(false); setSelPlan(null); }} title="Subscribe to Virtual Office">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Choose a Plan</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            {data.plans.virtual_office.map(plan => (
              <div key={plan.id} onClick={() => setSelPlan(plan.id)}
                style={{ border: `2px solid ${selPlan === plan.id ? BRAND.blue : "#E5E7EB"}`, borderRadius: 10, padding: "14px 12px", cursor: "pointer", background: selPlan === plan.id ? BRAND.lightBlue : "#fff", transition: "all .15s" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: selPlan === plan.id ? BRAND.blue : "#111" }}>{plan.label}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: BRAND.blue, marginTop: 2 }}>{formatNGN(plan.price)}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{plan.days} days</div>
              </div>
            ))}
          </div>
          {hasComplimentaryAccess && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#16A34A" }}>
              ✦ You currently have complimentary utility bill access. Upgrading gives you the full virtual office including business address, mail handling, and certificate of registration.
            </div>
          )}
          <PaymentSelector paymentMethods={data.paymentMethods} amount={data.plans.virtual_office.find(p => p.id === selPlan)?.price || 0} selected={payMethod} onChange={setPayMethod} paying={paying || psOpening} />
          <button onClick={subscribe} disabled={paying || psOpening || !selPlan || !payMethod}
            style={{ width: "100%", padding: "12px", background: paying || psOpening || !selPlan || !payMethod ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: paying || psOpening || !selPlan || !payMethod ? "not-allowed" : "pointer" }}>
            {paying ? "Saving..." : psOpening ? "Opening Paystack..." : selPlan ? `Pay ${formatNGN(data.plans.virtual_office.find(p => p.id === selPlan)?.price || 0)}` : "Select a plan to continue"}
          </button>
        </div>
      </Modal>

      {/* Utility bill request modal */}
      <Modal open={utilReqModal} onClose={() => setUtilReqModal(false)} title="Request Utility Bill">
        <div style={{ background: BRAND.lightOrange, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.orange, marginBottom: 4 }}>What happens next?</div>
          <div style={{ fontSize: 13, color: "#374151" }}>Hub43 will prepare an official utility bill for your registered address. You'll be notified once it's ready, typically within 3–5 business days.</div>
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 20 }}>Your registered address: <strong style={{ color: "#374151" }}>43 Balogun Street, Lagos Island, Lagos</strong></div>
        <button onClick={submitUtilRequest} style={{ width: "100%", padding: "12px", background: BRAND.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Submit Request
        </button>
      </Modal>
    </div>
  );
};

// ─── ADMIN: USERS ─────────────────────────────────────────────────────────────
const AdminUsers = ({ data, setData }) => {
  const [q, setQ] = useState("");
  const [showAddFD, setShowAddFD] = useState(false);
  const [fdForm, setFdForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [fdErrors, setFdErrors] = useState({});
  const [fdSuccess, setFdSuccess] = useState("");
  const [adding, setAdding] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const filtered = data.users.filter(u =>
    !q || u.name.toLowerCase().includes(q.toLowerCase()) ||
    u.email.toLowerCase().includes(q.toLowerCase()) ||
    u.role.toLowerCase().includes(q.toLowerCase())
  );

  const validateFD = () => {
    const e = {};
    if (!fdForm.name.trim()) e.name = "Name is required";
    if (!fdForm.email.trim() || !/\S+@\S+\.\S+/.test(fdForm.email)) e.email = "Valid email required";
    const emailTaken = data.users.some(u => u.email.toLowerCase() === fdForm.email.trim().toLowerCase());
    if (emailTaken) e.email = "Email already in use";
    if (!fdForm.password || fdForm.password.length < 6) e.password = "Password must be at least 6 characters";
    if (fdForm.password !== fdForm.confirmPassword) e.confirmPassword = "Passwords do not match";
    setFdErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAddFD = () => {
    if (!validateFD()) return;
    setAdding(true);
    setTimeout(() => {
      const newUserId = "u" + Date.now();
      const newUser = {
        id: newUserId,
        name: fdForm.name.trim(),
        email: fdForm.email.trim(),
        phone: fdForm.phone.trim() || "—",
        role: "frontdesk",
        joined: new Date().toISOString().split("T")[0],
      };
      setData(d => {
        const es = d.emailSettings || {};
        // Send welcome email with credentials
        const params = buildEmailParams.frontDeskWelcome({ user: newUser, password: fdForm.password });
        sendZeptoMail({ templateParams: params });
        const logEntry = { id: "el" + Date.now(), type: "frontdesk_welcome", to: newUser.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
        return {
          ...d,
          users: [...d.users, newUser],
          userPasswords: { ...(d.userPasswords || {}), [newUserId]: fdForm.password },
          emailSettings: { ...es, emailLog: [...(es.emailLog || []), logEntry] },
        };
      });
      setFdSuccess(`Front desk account created for ${fdForm.name.trim()}. Login credentials have been emailed.`);
      setFdForm({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
      setFdErrors({});
      setAdding(false);
      setShowAddFD(false);
      setTimeout(() => setFdSuccess(""), 5000);
    }, 800);
  };

  const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 };
  const errStyle = { fontSize: 11, color: BRAND.red, marginTop: 4 };

  return (
  <div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Members & Staff</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, role…"
          style={{ padding: "8px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, outline: "none", width: 220 }} />
        <button onClick={() => setShowAddFD(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          <Icon name="plus" size={14} color="#fff" /> Add Front Desk
        </button>
      </div>
    </div>

    {fdSuccess && (
      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
        <Icon name="check" size={16} color="#16A34A" /> {fdSuccess}
      </div>
    )}

    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#F9FAFB" }}>
          {["Name", "Email", "Phone", "Role", "Joined", "Subscriptions"].map(h => (
            <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id} style={{ borderTop: "1px solid #F3F4F6" }}>
              <td style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.role === "frontdesk" ? BRAND.blue + "22" : BRAND.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: u.role === "frontdesk" ? BRAND.blue : BRAND.orange }}>{u.name[0]}</div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</span>
                </div>
              </td>
              <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{u.email}</td>
              <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{u.phone}</td>
              <td style={{ padding: "12px 16px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
                  background: u.role === "admin" ? BRAND.lightRed : u.role === "frontdesk" ? BRAND.lightBlue : "#F3F4F6",
                  color: u.role === "admin" ? BRAND.red : u.role === "frontdesk" ? BRAND.blue : "#374151",
                  textTransform: "capitalize" }}>
                  {u.role === "frontdesk" ? "Front Desk" : u.role}
                </span>
              </td>
              <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(u.joined)}</td>
              <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>
                {u.role === "member" ? `${data.subscriptions.filter(s => s.userId === u.id && s.status === "active").length} active` : "—"}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No users match "{q}"</td></tr>
          )}
        </tbody>
      </table>
    </div>

    {/* Add Front Desk Modal */}
    <Modal open={showAddFD} onClose={() => { setShowAddFD(false); setFdErrors({}); setFdForm({ name: "", email: "", phone: "", password: "", confirmPassword: "" }); }} title="Add Front Desk User" width={480}>
      <div style={{ marginBottom: 16, background: BRAND.lightBlue, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, color: BRAND.blue, fontWeight: 600 }}>Front desk staff can onboard members, manage check-ins, view all members, and log expenses. Login credentials will be emailed automatically on creation.</div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Full Name <span style={{ color: BRAND.red }}>*</span></label>
        <input value={fdForm.name} onChange={e => setFdForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Bola Adeyemi" style={{ ...inputStyle, borderColor: fdErrors.name ? BRAND.red : "#E5E7EB" }} />
        {fdErrors.name && <div style={errStyle}>{fdErrors.name}</div>}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Email Address <span style={{ color: BRAND.red }}>*</span></label>
        <input value={fdForm.email} onChange={e => setFdForm(f => ({ ...f, email: e.target.value }))}
          type="email" placeholder="bola@hub43.com" style={{ ...inputStyle, borderColor: fdErrors.email ? BRAND.red : "#E5E7EB" }} />
        {fdErrors.email && <div style={errStyle}>{fdErrors.email}</div>}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Phone Number</label>
        <input value={fdForm.phone} onChange={e => setFdForm(f => ({ ...f, phone: e.target.value }))}
          placeholder="+234-800-000-0000" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Password <span style={{ color: BRAND.red }}>*</span></label>
        <div style={{ position: "relative" }}>
          <input value={fdForm.password} onChange={e => setFdForm(f => ({ ...f, password: e.target.value }))}
            type={showPass ? "text" : "password"} placeholder="Min. 6 characters"
            style={{ ...inputStyle, paddingRight: 60, borderColor: fdErrors.password ? BRAND.red : "#E5E7EB" }} />
          <button onClick={() => setShowPass(v => !v)}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>
            {showPass ? "Hide" : "Show"}
          </button>
        </div>
        {fdErrors.password && <div style={errStyle}>{fdErrors.password}</div>}
      </div>
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Confirm Password <span style={{ color: BRAND.red }}>*</span></label>
        <input value={fdForm.confirmPassword} onChange={e => setFdForm(f => ({ ...f, confirmPassword: e.target.value }))}
          type={showPass ? "text" : "password"} placeholder="Re-enter password"
          style={{ ...inputStyle, borderColor: fdErrors.confirmPassword ? BRAND.red : "#E5E7EB" }} />
        {fdErrors.confirmPassword && <div style={errStyle}>{fdErrors.confirmPassword}</div>}
      </div>
      <button onClick={handleAddFD} disabled={adding}
        style={{ width: "100%", padding: "12px", background: adding ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: adding ? "not-allowed" : "pointer" }}>
        {adding ? "Creating Account…" : "Create Front Desk Account"}
      </button>
    </Modal>
  </div>
  );
};

// ─── FRONT DESK: ACCOUNT / CHANGE PASSWORD ────────────────────────────────────
const FrontDeskAccount = ({ user, data, setData }) => {
  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 };
  const errStyle = { fontSize: 11, color: BRAND.red, marginTop: 4 };

  const handleChange = () => {
    const e = {};
    const passwords = data.userPasswords || {};
    const currentStored = passwords[user.id] || "";
    if (!form.current) e.current = "Current password is required";
    else if (form.current !== currentStored) e.current = "Current password is incorrect";
    if (!form.newPass || form.newPass.length < 6) e.newPass = "New password must be at least 6 characters";
    if (form.newPass === form.current) e.newPass = "New password must be different from current";
    if (form.newPass !== form.confirm) e.confirm = "Passwords do not match";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setTimeout(() => {
      setData(d => ({
        ...d,
        userPasswords: { ...(d.userPasswords || {}), [user.id]: form.newPass },
      }));
      setForm({ current: "", newPass: "", confirm: "" });
      setErrors({});
      setSaving(false);
      setSuccess("Password updated successfully!");
      setTimeout(() => setSuccess(""), 4000);
    }, 800);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>My Account</h2>
        <p style={{ margin: 0, color: "#6B7280", fontSize: 13 }}>Manage your login credentials.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 760 }}>
        {/* Profile card */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: BRAND.blue + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: BRAND.blue }}>{user.name[0]}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{user.name}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{user.email}</div>
              <span style={{ fontSize: 10, fontWeight: 700, background: BRAND.lightBlue, color: BRAND.blue, padding: "2px 8px", borderRadius: 10, marginTop: 4, display: "inline-block" }}>Front Desk</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["Phone", user.phone || "—"], ["Joined", formatDate(user.joined)]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Change password card */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Change Password</span>
          </div>

          {success && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
              <Icon name="check" size={14} color="#16A34A" /> {success}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Current Password <span style={{ color: BRAND.red }}>*</span></label>
            <div style={{ position: "relative" }}>
              <input value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
                type={showCurrent ? "text" : "password"} placeholder="Your current password"
                style={{ ...inputStyle, paddingRight: 60, borderColor: errors.current ? BRAND.red : "#E5E7EB" }} />
              <button onClick={() => setShowCurrent(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
            {errors.current && <div style={errStyle}>{errors.current}</div>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New Password <span style={{ color: BRAND.red }}>*</span></label>
            <div style={{ position: "relative" }}>
              <input value={form.newPass} onChange={e => setForm(f => ({ ...f, newPass: e.target.value }))}
                type={showNew ? "text" : "password"} placeholder="Min. 6 characters"
                style={{ ...inputStyle, paddingRight: 60, borderColor: errors.newPass ? BRAND.red : "#E5E7EB" }} />
              <button onClick={() => setShowNew(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            {errors.newPass && <div style={errStyle}>{errors.newPass}</div>}
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Confirm New Password <span style={{ color: BRAND.red }}>*</span></label>
            <input value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              type={showNew ? "text" : "password"} placeholder="Re-enter new password"
              style={{ ...inputStyle, borderColor: errors.confirm ? BRAND.red : "#E5E7EB" }} />
            {errors.confirm && <div style={errStyle}>{errors.confirm}</div>}
          </div>

          <button onClick={handleChange} disabled={saving}
            style={{ width: "100%", padding: "11px", background: saving ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
};


const AdminBookings = ({ data, setData }) => {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const approve = (id) => {
    setData(d => {
      const b = d.bookings.find(bk => bk.id === id);
      if (!b) return d;
      const invId = "inv" + Date.now();
      const serviceLabel = b.service === "hot_desk" ? "Hot Desk" : "Meeting Room";
      const desc = b.description || `${serviceLabel} booking`;
      const inv = { id: invId, userId: b.userId, bookingId: b.id, amount: b.amount, date: new Date().toISOString().split("T")[0], status: "paid", service: serviceLabel, description: desc };
      const notifId = "n" + Date.now();
      const notif = b.service === "hot_desk"
        ? { id: notifId, userId: b.userId, type: "info", message: `✅ Your Hot Desk booking has been approved! Check your Hot Desk page for WiFi credentials.`, read: false, date: new Date().toISOString().split("T")[0] }
        : { id: notifId, userId: b.userId, type: "info", message: `✅ Your Meeting Room booking for ${formatDate(b.date)} has been approved.`, read: false, date: new Date().toISOString().split("T")[0] };
      // Send approval email
      const es = d.emailSettings || {};
      if (es.enableBookingApproval !== false) {
        const member = d.users.find(u => u.id === b.userId);
        if (member) {
          const params = buildEmailParams.bookingApproved({ user: member, booking: b, wifiSsid: b.service === "hot_desk" ? d.wifi?.ssid : undefined, wifiPassword: b.service === "hot_desk" ? d.wifi?.password : undefined });
          sendZeptoMail({ templateParams: params });
          const logEntry = { id: "el" + Date.now(), type: "booking_approved", to: member.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
          return {
            ...d,
            bookings: d.bookings.map(bk => bk.id === id ? { ...bk, status: "approved", invoiceId: invId } : bk),
            invoices: [...d.invoices, inv],
            notifications: [...d.notifications, notif],
            emailSettings: { ...es, emailLog: [...(es.emailLog || []), logEntry] },
          };
        }
      }
      return {
        ...d,
        bookings: d.bookings.map(bk => bk.id === id ? { ...bk, status: "approved", invoiceId: invId } : bk),
        invoices: [...d.invoices, inv],
        notifications: [...d.notifications, notif],
      };
    });
  };
  const reject = (id) => {
    setData(d => {
      const b = d.bookings.find(bk => bk.id === id);
      const notifId = "n" + Date.now();
      const notif = b ? { id: notifId, userId: b.userId, type: "info", message: `❌ Your ${b.service === "hot_desk" ? "Hot Desk" : "Meeting Room"} booking for ${formatDate(b.date)} was not approved. Please contact us for assistance.`, read: false, date: new Date().toISOString().split("T")[0] } : null;
      return {
        ...d,
        bookings: d.bookings.map(bk => bk.id === id ? { ...bk, status: "rejected" } : bk),
        notifications: notif ? [...d.notifications, notif] : d.notifications,
      };
    });
  };

  const filteredBookings = data.bookings.filter(b => {
    const u = data.users.find(u => u.id === b.userId);
    const matchQ = !q || u?.name.toLowerCase().includes(q.toLowerCase()) || b.service.includes(q.toLowerCase()) || b.date.includes(q);
    const matchS = statusFilter === "all" || b.status === statusFilter;
    return matchQ && matchS;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BRAND.blue }}>All Bookings</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "8px 12px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }}>
            {["all","pending","approved","completed","rejected"].map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search member, service…"
            style={{ padding: "8px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, outline: "none", width: 220 }} />
        </div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {["Member", "Service", "Plan", "Date", "Amount", "Status", "Actions"].map(h => (
              <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filteredBookings.map(b => {
              const u = data.users.find(u => u.id === b.userId);
              return (
                <tr key={b.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>{u?.name}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280", textTransform: "capitalize" }}>{b.service.replace("_", " ")}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151", textTransform: "capitalize" }}>
                    {b.plan || "—"}
                    {b.plan === "hourly" && b.hours ? <span style={{ fontSize: 11, color: "#9CA3AF" }}> · {b.hours}h</span> : null}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(b.date)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(b.amount)}</td>
                  <td style={{ padding: "12px 16px" }}><Badge status={b.status} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    {b.status === "pending" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => approve(b.id)} style={{ padding: "5px 10px", background: "#DCFCE7", color: "#16A34A", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Approve</button>
                        <button onClick={() => reject(b.id)} style={{ padding: "5px 10px", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredBookings.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No bookings match your search</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── ADMIN: OFFICES ───────────────────────────────────────────────────────────
const AdminOffices = ({ data, setData }) => {
  const unassign = (officeId) => {
    const office = data.offices.find(o => o.id === officeId);
    if (!office.assignedTo) return;
    setData(d => ({
      ...d,
      offices: d.offices.map(o => o.id === officeId ? { ...o, status: "available", assignedTo: null } : o),
      subscriptions: d.subscriptions.map(s => s.officeId === officeId && s.status === "active" ? { ...s, status: "expired" } : s),
    }));
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Office Management</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
        {data.offices.map(o => {
          const assigned = o.assignedTo ? data.users.find(u => u.id === o.assignedTo) : null;
          return (
            <div key={o.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{o.name}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>{o.floor} · Cap: {o.capacity}</div>
                </div>
                <Badge status={o.status} />
              </div>
              {assigned && (
                <div style={{ background: BRAND.lightBlue, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>Assigned to</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{assigned.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{assigned.email}</div>
                </div>
              )}
              {o.status === "occupied" && (
                <button onClick={() => unassign(o.id)} style={{ width: "100%", padding: "8px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Unassign & Mark Available
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── ADMIN: VIRTUAL OFFICES ───────────────────────────────────────────────────
const AdminVirtualOffices = ({ data, setData }) => {
  const virtualSubs = data.subscriptions.filter(s => s.service === "virtual_office");
  const [activeTab, setActiveTab] = useState("subscribers"); // "subscribers" | "documents"
  const [utilUploading, setUtilUploading] = useState(false);
  const [certUploading, setCertUploading] = useState(null); // userId being uploaded
  const [toast, setToast] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const cancel = (id) => setData(d => ({ ...d, subscriptions: d.subscriptions.map(s => s.id === id ? { ...s, status: "expired" } : s) }));

  // Upload utility bill (shared for all users)
  const handleUtilityUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUtilUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const now = new Date().toISOString();
      setData(d => ({
        ...d,
        virtualDocs: {
          ...d.virtualDocs,
          utilityBill: { fileName: file.name, uploadedAt: now, dataUrl: ev.target.result },
        },
      }));
      setUtilUploading(false);
      showToast("✅ Utility bill uploaded successfully!");
    };
    reader.readAsDataURL(file);
  };

  // Upload Certificate of Registration for a specific user
  const handleCertUpload = (userId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCertUploading(userId);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const now = new Date().toISOString();
      setData(d => ({
        ...d,
        virtualDocs: {
          ...d.virtualDocs,
          certificates: {
            ...d.virtualDocs.certificates,
            [userId]: { fileName: file.name, uploadedAt: now, dataUrl: ev.target.result },
          },
        },
        notifications: [
          ...d.notifications,
          { id: "n" + Date.now(), userId, type: "info", message: "📄 Your Certificate of Registration is now available for download.", read: false, date: new Date().toISOString().split("T")[0] },
        ],
      }));
      setCertUploading(null);
      showToast("✅ Certificate uploaded and member notified!");
    };
    reader.readAsDataURL(file);
  };

  // Fulfill a utility bill request
  const fulfillRequest = (reqId, userId) => {
    setData(d => ({
      ...d,
      virtualDocs: {
        ...d.virtualDocs,
        utilityRequests: d.virtualDocs.utilityRequests.map(r => r.id === reqId ? { ...r, status: "fulfilled" } : r),
      },
      notifications: [
        ...d.notifications,
        { id: "n" + Date.now(), userId, type: "info", message: "📋 Your utility bill request has been fulfilled. Please contact the Hub43 team to receive your document.", read: false, date: new Date().toISOString().split("T")[0] },
      ],
    }));
    showToast("✅ Request marked as fulfilled and member notified!");
  };

  const utilBill = data.virtualDocs?.utilityBill;
  const daysSinceUtil = utilBill ? Math.floor((new Date() - new Date(utilBill.uploadedAt)) / 86400000) : null;
  const pendingRequests = (data.virtualDocs?.utilityRequests || []).filter(r => r.status === "pending");
  const virtualMembers = data.users.filter(u => virtualSubs.some(s => s.userId === u.id));

  const tabBtn = (key, label, count) => (
    <button onClick={() => setActiveTab(key)} style={{ padding: "8px 16px", background: activeTab === key ? BRAND.blue : "transparent", color: activeTab === key ? "#fff" : "#6B7280", border: `1.5px solid ${activeTab === key ? BRAND.blue : "#E5E7EB"}`, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
      {label}
      {count > 0 && <span style={{ background: activeTab === key ? "rgba(255,255,255,0.25)" : BRAND.red, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{count}</span>}
    </button>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Virtual Offices</h2>
      <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13 }}>Manage subscriptions, upload documents & handle requests.</p>

      {toast && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Subscribers" value={virtualSubs.length} icon="virtual" color={BRAND.blue} />
        <StatCard label="Active" value={virtualSubs.filter(s => s.status === "active").length} icon="check" color="#059669" />
        <StatCard label="Expired" value={virtualSubs.filter(s => s.status === "expired").length} icon="x" color={BRAND.red} />
        <StatCard label="Pending Requests" value={pendingRequests.length} sub={pendingRequests.length > 0 ? "Needs action" : "All clear"} icon="invoice" color={pendingRequests.length > 0 ? BRAND.orange : "#059669"} />
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {tabBtn("subscribers", "Subscribers", 0)}
        {tabBtn("documents", "Documents & Uploads", pendingRequests.length)}
      </div>

      {/* ── SUBSCRIBERS TAB ── */}
      {activeTab === "subscribers" && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#F9FAFB" }}>
              {["Member", "Plan", "Start", "Expires", "Days Left", "Amount", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {virtualSubs.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "24px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No virtual office subscribers yet.</td></tr>
              )}
              {virtualSubs.map(s => {
                const u = data.users.find(u => u.id === s.userId);
                const dl = daysLeft(s.endDate);
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: BRAND.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: BRAND.orange }}>{u?.name[0]}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, textTransform: "capitalize" }}>{s.plan}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(s.startDate)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(s.endDate)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: dl <= 30 ? BRAND.red : "#059669" }}>{dl}d</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(s.amount)}</td>
                    <td style={{ padding: "12px 16px" }}><Badge status={s.status} /></td>
                    <td style={{ padding: "12px 16px" }}>
                      {s.status === "active" && (
                        <button onClick={() => cancel(s.id)} style={{ padding: "5px 10px", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {activeTab === "documents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── UTILITY BILL (global) ── */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Icon name="invoice" size={18} color={BRAND.orange} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Utility Bill</span>
                  <span style={{ fontSize: 11, background: BRAND.lightOrange, color: BRAND.orange, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>SHARED — ALL MEMBERS</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#6B7280", maxWidth: 460 }}>
                  Upload one utility bill for the address. If uploaded within 30 days, members can download it instantly. If older than 30 days, members must submit a request.
                </p>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: BRAND.orange, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                <Icon name="plus" size={14} color="#fff" />
                {utilBill ? "Replace Bill" : "Upload Bill"}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUtilityUpload} style={{ display: "none" }} />
              </label>
            </div>
            {utilUploading && <div style={{ fontSize: 13, color: BRAND.orange, marginBottom: 12 }}>Uploading…</div>}
            {utilBill ? (
              <div style={{ background: daysSinceUtil <= 30 ? "#F0FDF4" : "#FFF7ED", border: `1px solid ${daysSinceUtil <= 30 ? "#BBF7D0" : "#FED7AA"}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: daysSinceUtil <= 30 ? "#DCFCE7" : "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="invoice" size={18} color={daysSinceUtil <= 30 ? "#16A34A" : BRAND.orange} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{utilBill.fileName}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                    Uploaded {daysSinceUtil === 0 ? "today" : `${daysSinceUtil} day${daysSinceUtil !== 1 ? "s" : ""} ago`} · {new Date(utilBill.uploadedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: daysSinceUtil <= 30 ? "#DCFCE7" : "#FEF3C7", color: daysSinceUtil <= 30 ? "#16A34A" : BRAND.orange }}>
                  {daysSinceUtil <= 30 ? "✓ Instant Download Available" : "⚠ Request Required (>30 days)"}
                </span>
              </div>
            ) : (
              <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "20px", textAlign: "center", border: "2px dashed #E5E7EB" }}>
                <Icon name="invoice" size={28} color="#D1D5DB" />
                <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 8 }}>No utility bill uploaded yet. Members will need to submit requests.</div>
              </div>
            )}

            {/* Pending utility requests */}
            {(data.virtualDocs?.utilityRequests || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Utility Bill Requests</div>
                {(data.virtualDocs.utilityRequests).map(req => {
                  const u = data.users.find(u => u.id === req.userId);
                  return (
                    <div key={req.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: req.status === "pending" ? "#FFFBEB" : "#F9FAFB", borderRadius: 8, marginBottom: 6, border: `1px solid ${req.status === "pending" ? "#FDE68A" : "#E5E7EB"}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>Requested {new Date(req.requestedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge status={req.status === "pending" ? "pending" : "active"} />
                        {req.status === "pending" && (
                          <button onClick={() => fulfillRequest(req.id, req.userId)} style={{ padding: "5px 12px", background: "#DCFCE7", color: "#16A34A", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Mark Fulfilled
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── CERTIFICATES OF REGISTRATION (per user) ── */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon name="invoice" size={18} color={BRAND.blue} />
              <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Certificates of Registration</span>
              <span style={{ fontSize: 11, background: BRAND.lightBlue, color: BRAND.blue, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>PER MEMBER</span>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6B7280" }}>Upload individual business certificates for each virtual office subscriber. The member will be notified and can download their certificate immediately.</p>

            {virtualMembers.length === 0 && (
              <div style={{ background: "#F9FAFB", borderRadius: 10, padding: 20, textAlign: "center", border: "2px dashed #E5E7EB" }}>
                <div style={{ fontSize: 13, color: "#9CA3AF" }}>No active virtual office subscribers yet.</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {virtualMembers.map(u => {
                const cert = data.virtualDocs?.certificates?.[u.id];
                const sub = virtualSubs.find(s => s.userId === u.id && s.status === "active");
                return (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: BRAND.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: BRAND.orange, flexShrink: 0 }}>{u.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u.email} · {sub ? `${sub.plan} plan · ${daysLeft(sub.endDate)}d left` : "Subscription expired"}</div>
                      {cert && <div style={{ fontSize: 11, color: "#16A34A", marginTop: 2, fontWeight: 600 }}>📄 {cert.fileName} · uploaded {new Date(cert.uploadedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {cert && (
                        <a href={cert.dataUrl} download={cert.fileName} style={{ padding: "6px 12px", background: BRAND.lightBlue, color: BRAND.blue, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                          <Icon name="download" size={12} color={BRAND.blue} /> Preview
                        </a>
                      )}
                      <label style={{ padding: "6px 12px", background: cert ? "#F3F4F6" : BRAND.blue, color: cert ? "#374151" : "#fff", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                        {certUploading === u.id ? "Uploading…" : cert ? "Replace" : "Upload Certificate"}
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleCertUpload(u.id, e)} style={{ display: "none" }} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SUBSCRIPTIONS VIEW ───────────────────────────────────────────────────────
const SubscriptionsView = ({ data, setData, isAdmin, userId }) => {
  const subs = isAdmin ? data.subscriptions : data.subscriptions.filter(s => s.userId === userId);
  const [renewModal, setRenewModal] = useState(null);
  const [renewPlan, setRenewPlan] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [psOpening, setPsOpening] = useState(false);
  const [renewSuccess, setRenewSuccess] = useState("");
  const [renewPayMethodSub, setRenewPayMethodSub] = useState(null);

  const getPlanDays = (service, plan) => {
    if (service === "virtual_office") {
      const vp = data.plans.virtual_office.find(p => p.id === plan);
      return vp ? vp.days : 0;
    }
    return OFFICE_PLAN_DAYS[plan] || 0;
  };

  const getPlanPrice = (sub, plan) => {
    if (sub.service === "private_office") {
      const office = data.offices.find(o => o.id === sub.officeId);
      return office?.pricing?.[plan] || 0;
    }
    if (sub.service === "virtual_office") {
      const vp = data.plans.virtual_office.find(p => p.id === plan);
      return vp?.price || 0;
    }
    return 0;
  };

  const getAvailablePlans = (sub) => {
    if (sub.service === "private_office") return Object.keys(OFFICE_PLAN_DAYS);
    if (sub.service === "virtual_office") return data.plans.virtual_office.map(p => p.id);
    return [];
  };

  const handleRenew = () => {
    if (!renewModal || !renewPlan) return;
    if (!isAdmin && !renewPayMethodSub) return;
    const isBankTransfer = !isAdmin && renewPayMethodSub === "bank";

    const commitRenewal = () => {
      const sub = renewModal;
      const days = getPlanDays(sub.service, renewPlan);
      const price = getPlanPrice(sub, renewPlan);
      const baseDate = new Date(Math.max(new Date(sub.endDate), new Date()));
      const newEnd = new Date(baseDate); newEnd.setDate(baseDate.getDate() + days);
      const newSubId = "s" + Date.now();
      const invId = "inv" + Date.now();
      const today = new Date().toISOString().split("T")[0];
      const renewedSub = { id: newSubId, userId: sub.userId, service: sub.service, plan: renewPlan,
        startDate: baseDate.toISOString().split("T")[0],
        endDate: newEnd.toISOString().split("T")[0],
        status: isBankTransfer ? "pending_transfer" : "active",
        officeId: sub.officeId || null, amount: price,
        paymentMethod: isAdmin ? "admin" : renewPayMethodSub,
        paymentConfirmed: !isBankTransfer,
      };
      setData(d => {
        const es = d.emailSettings || {};
        const member = d.users.find(u => u.id === sub.userId);
        let emailLogEntry = null;
        if (member && !isBankTransfer && es.enableSubscriptionRenewed !== false) {
          const params = buildEmailParams.subscriptionRenewed({ user: member, sub: renewedSub });
          sendZeptoMail({ templateParams: params });
          emailLogEntry = { id: "el" + Date.now(), type: "subscription_renewed", to: member.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
        }
        return {
          ...d,
          subscriptions: [
            ...d.subscriptions.map(s => s.id === sub.id ? { ...s, status: "expired" } : s),
            renewedSub,
          ],
          invoices: [...d.invoices, {
            id: invId, userId: sub.userId, amount: price, date: today,
            status: isBankTransfer ? "unpaid" : "paid",
            service: sub.service === "private_office" ? "Private Office" : "Virtual Office",
            description: `Renewal — ${sub.service.replace(/_/g," ")} (${renewPlan})`,
          }],
          notifications: [...d.notifications, {
            id: "n" + Date.now(), userId: sub.userId, type: isBankTransfer ? "warning" : "info",
            message: isBankTransfer
              ? `⏳ Renewal for ${sub.service.replace(/_/g," ")} submitted via bank transfer. Access resumes once admin confirms payment.`
              : `✅ Your ${sub.service.replace(/_/g," ")} has been renewed (${renewPlan} plan) until ${newEnd.toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}.`,
            read: false, date: today,
          }],
          ...(emailLogEntry ? { emailSettings: { ...es, emailLog: [...(es.emailLog || []), emailLogEntry] } } : {}),
        };
      });
      setRenewing(false); setRenewModal(null); setRenewPlan(""); setRenewPayMethodSub(null);
      setRenewSuccess(isBankTransfer ? "Renewal submitted — awaiting bank transfer confirmation." : "Subscription renewed successfully!");
      setTimeout(() => setRenewSuccess(""), 5000);
    };

    if (!isBankTransfer && !isAdmin) {
      const key = data.paymentMethods?.paystackKey;
      if (!key || !key.startsWith("pk_")) { alert("Paystack key not configured. Please contact the admin."); return; }
      const sub = renewModal;
      const price = getPlanPrice(sub, renewPlan);
      const member = data.users.find(u => u.id === sub.userId);
      openPaystackCheckout({
        key, email: member?.email || "", amount: price, name: member?.name || "",
        onOpen: () => setPsOpening(true),
        onSuccess: () => { setPsOpening(false); setRenewing(true); commitRenewal(); },
        onClose: () => setPsOpening(false),
      });
    } else {
      setRenewing(true);
      setTimeout(commitRenewal, 1200);
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>{isAdmin ? "All Subscriptions" : "My Subscriptions"}</h2>
      {renewSuccess && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="check" size={18} color="#16A34A" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>{renewSuccess}</span>
        </div>
      )}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {[isAdmin && "Member", "Service", "Plan", "Start", "End", "Days Left", "Amount", "Status", ""].filter(Boolean).map(h => (
              <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {subs.map(s => {
              const u = data.users.find(u => u.id === s.userId);
              const dl = daysLeft(s.endDate);
              const expiringSoon = dl <= 14 && s.status === "active";
              const plans = getAvailablePlans(s);
              return (
                <tr key={s.id} style={{ borderTop: "1px solid #F3F4F6", background: expiringSoon && !isAdmin ? "#FFFBEB" : "transparent" }}>
                  {isAdmin && <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>{u?.name}</td>}
                  <td style={{ padding: "12px 16px", fontSize: 13, textTransform: "capitalize" }}>{s.service.replace(/_/g, " ")}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, textTransform: "capitalize" }}>{s.plan}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(s.startDate)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(s.endDate)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: dl <= 7 ? BRAND.red : dl <= 30 ? BRAND.orange : "#059669" }}>{dl}d</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(s.amount)}</td>
                  <td style={{ padding: "12px 16px" }}><Badge status={s.status} /></td>
                  {!isAdmin && (
                    <td style={{ padding: "12px 16px" }}>
                      {s.status === "active" && plans.length > 0 && (
                        <button onClick={() => { setRenewModal(s); setRenewPlan(s.plan); }}
                          style={{ padding: "5px 12px", background: expiringSoon ? BRAND.orange : BRAND.lightBlue, color: expiringSoon ? "#fff" : BRAND.blue, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                          {expiringSoon ? "⚡ Renew" : "Renew"}
                        </button>
                      )}
                    </td>
                  )}
                  {isAdmin && (
                    <td style={{ padding: "12px 16px" }}>
                      {s.status === "active" && plans.length > 0 && (
                        <button onClick={() => { setRenewModal(s); setRenewPlan(s.plan); }}
                          style={{ padding: "5px 12px", background: expiringSoon ? BRAND.orange : BRAND.lightBlue, color: expiringSoon ? "#fff" : BRAND.blue, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                          {expiringSoon ? "⚡ Renew" : "Renew"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expiry alerts for members */}
      {!isAdmin && subs.filter(s => daysLeft(s.endDate) <= 14 && s.status === "active").length > 0 && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "14px 18px", marginTop: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 20, flexShrink: 0 }}>⚠️</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>Subscriptions expiring soon</div>
            {subs.filter(s => daysLeft(s.endDate) <= 14 && s.status === "active").map(s => (
              <div key={s.id} style={{ fontSize: 12, color: "#78350F", marginBottom: 2 }}>
                {s.service.replace(/_/g," ")} — expires in <strong>{daysLeft(s.endDate)} days</strong> ({formatDate(s.endDate)}). Click <strong>Renew</strong> in the table to continue uninterrupted.
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Renew / Upgrade Modal */}
      <Modal open={!!renewModal} onClose={() => { setRenewModal(null); setRenewing(false); setPsOpening(false); setRenewPayMethodSub(null); }} title={isAdmin ? "Renew Subscription (on behalf of member)" : "Renew Subscription"} width={460}>
        {renewModal && (() => {
          const plans = getAvailablePlans(renewModal);
          const memberUser = isAdmin ? data.users.find(u => u.id === renewModal.userId) : null;
          return (
            <div>
              {isAdmin && memberUser && (
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: BRAND.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: BRAND.orange }}>{memberUser.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>Renewing on behalf of</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{memberUser.name} <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 400 }}>({memberUser.email})</span></div>
                  </div>
                </div>
              )}
              <div style={{ background: BRAND.lightBlue, borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#6B7280" }}>Renewing</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.blue, textTransform: "capitalize" }}>
                  {renewModal.service.replace(/_/g," ")} — currently <strong>{renewModal.plan}</strong>
                </div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
                  Current expiry: {formatDate(renewModal.endDate)} ({daysLeft(renewModal.endDate)} days left)
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 10 }}>Select Plan (change to upgrade)</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {plans.map(planId => {
                    const price = getPlanPrice(renewModal, planId);
                    const days = getPlanDays(renewModal.service, planId);
                    return (
                      <button key={planId} onClick={() => setRenewPlan(planId)}
                        style={{ padding: "12px 16px", background: renewPlan === planId ? BRAND.lightBlue : "#F9FAFB", border: `2px solid ${renewPlan === planId ? BRAND.blue : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: renewPlan === planId ? BRAND.blue : "#111", textTransform: "capitalize" }}>
                            {planId} {renewPlan === planId && "✓"}
                          </div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{days} days</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: renewPlan === planId ? BRAND.blue : "#374151" }}>{formatNGN(price)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {renewPlan && (
                <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "#374151" }}>
                  New period: <strong>{getPlanDays(renewModal.service, renewPlan)} days</strong> from {daysLeft(renewModal.endDate) > 0 ? `current expiry (${formatDate(renewModal.endDate)})` : "today"}
                  &nbsp;· Total: <strong style={{ color: BRAND.blue }}>{formatNGN(getPlanPrice(renewModal, renewPlan))}</strong>
                </div>
              )}
              {!isAdmin && renewPlan && (
                <PaymentSelector paymentMethods={data.paymentMethods} amount={getPlanPrice(renewModal, renewPlan)} selected={renewPayMethodSub} onChange={setRenewPayMethodSub} paying={renewing || psOpening} />
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setRenewModal(null); setRenewing(false); setPsOpening(false); setRenewPayMethodSub(null); }} style={{ padding: "11px 18px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button onClick={handleRenew} disabled={!renewPlan || renewing || psOpening || (!isAdmin && !renewPayMethodSub)}
                  style={{ flex: 1, padding: "11px", background: !renewPlan || renewing || psOpening || (!isAdmin && !renewPayMethodSub) ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: !renewPlan || renewing || psOpening || (!isAdmin && !renewPayMethodSub) ? "not-allowed" : "pointer" }}>
                  {renewing ? "Saving..." : psOpening ? "Opening Paystack..." : `Confirm Renewal — ${formatNGN(getPlanPrice(renewModal, renewPlan))}`}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

// ─── INVOICE PDF DOWNLOAD ─────────────────────────────────────────────────────
const downloadInvoicePDF = (inv, user) => {
  const fmt = (n) => "&#8358;" + Number(n).toLocaleString("en-NG");
  const fmtD = (d) => new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  const invNum = "HUB-" + inv.id.toUpperCase().replace(/[^A-Z0-9]/g, "").padStart(5, "0");
  const isPaid = inv.status === "paid";
  const today = new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  // Wave-style invoice: clean white layout, accent colour bar, clear typography
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invNum} — Hub43 Workspace</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f6fa;color:#1a1a2e;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .wrapper{max-width:720px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.10);}
  /* ── top accent bar ── */
  .accent-bar{height:6px;background:linear-gradient(90deg,#1E3A8A 0%,#E07B2A 100%);}
  /* ── header ── */
  .header{padding:40px 48px 28px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #eef0f4;}
  .brand{}
  .brand-logo{font-size:26px;font-weight:900;color:#1E3A8A;letter-spacing:-0.5px;line-height:1;}
  .brand-logo em{color:#E07B2A;font-style:normal;}
  .brand-sub{font-size:10px;color:#94A3B8;letter-spacing:.18em;text-transform:uppercase;margin-top:3px;}
  .brand-addr{font-size:11px;color:#64748B;margin-top:10px;line-height:1.7;}
  .inv-meta{text-align:right;}
  .inv-label{font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:.12em;text-transform:uppercase;}
  .inv-number{font-size:22px;font-weight:800;color:#1E3A8A;margin-top:4px;letter-spacing:.04em;}
  .inv-dates{font-size:11px;color:#64748B;margin-top:8px;line-height:1.8;}
  .inv-dates strong{color:#374151;font-weight:600;}
  /* ── status badge ── */
  .status-row{padding:10px 48px;background:${isPaid ? "#f0fdf4" : "#fff7ed"};border-bottom:1px solid ${isPaid ? "#bbf7d0" : "#fed7aa"};}
  .status-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:${isPaid ? "#dcfce7" : "#ffedd5"};color:${isPaid ? "#15803d" : "#c2410c"};}
  .status-pill svg{flex-shrink:0;}
  /* ── body ── */
  .body{padding:36px 48px;}
  /* addresses */
  .address-row{display:flex;gap:48px;margin-bottom:36px;}
  .address-block{}
  .addr-lbl{font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px;}
  .addr-name{font-size:15px;font-weight:700;color:#111827;}
  .addr-detail{font-size:12px;color:#6B7280;margin-top:4px;line-height:1.6;}
  /* line items */
  .items-wrap{margin-bottom:0;}
  .items-table{width:100%;border-collapse:collapse;}
  .items-table thead tr{background:#F8FAFC;border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;}
  .items-table th{padding:10px 16px;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.1em;text-align:left;}
  .items-table th.r{text-align:right;}
  .items-table tbody tr{border-bottom:1px solid #F1F5F9;}
  .items-table td{padding:16px 16px;font-size:13px;color:#374151;vertical-align:top;}
  .items-table td.r{text-align:right;}
  .item-title{font-weight:600;color:#111827;font-size:14px;}
  .item-sub{font-size:11px;color:#94A3B8;margin-top:3px;}
  .qty-cell{font-size:13px;color:#6B7280;}
  .price-cell{font-size:13px;color:#374151;font-weight:500;}
  .amount-cell{font-size:14px;font-weight:700;color:#1E3A8A;}
  /* totals */
  .totals-wrap{margin-top:0;border-top:2px solid #E5E7EB;}
  .totals-table{width:100%;border-collapse:collapse;}
  .totals-table td{padding:10px 16px;font-size:13px;color:#374151;}
  .totals-table td.r{text-align:right;}
  .totals-table .sub-row td{border-bottom:1px solid #F1F5F9;}
  .totals-table .total-row td{background:#1E3A8A;color:#fff;font-size:15px;font-weight:800;padding:16px 16px;}
  .totals-table .total-row td.r{color:#fff;font-size:18px;}
  /* notes */
  .notes{margin:28px 0 0;}
  .notes-lbl{font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;}
  .notes-text{font-size:12px;color:#6B7280;line-height:1.7;padding:14px 16px;background:#F8FAFC;border-radius:6px;border:1px solid #E5E7EB;}
  /* footer */
  .footer{padding:24px 48px;border-top:1px solid #EEF0F4;display:flex;justify-content:space-between;align-items:center;background:#FAFBFC;}
  .footer-brand{font-size:13px;font-weight:800;color:#1E3A8A;}
  .footer-brand em{color:#E07B2A;font-style:normal;}
  .footer-copy{font-size:10px;color:#9CA3AF;line-height:1.6;text-align:right;}
  /* print controls */
  .controls{display:flex;gap:10px;justify-content:center;padding:20px 48px 28px;background:#f5f6fa;}
  .btn{padding:10px 24px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.02em;}
  .btn-print{background:#1E3A8A;color:#fff;}
  .btn-close{background:#E5E7EB;color:#374151;}
  @media print{
    body{background:#fff;}
    .wrapper{box-shadow:none;margin:0;border-radius:0;max-width:100%;}
    .controls{display:none;}
  }
</style>
</head>
<body>
<div class="wrapper">
  <div class="accent-bar"></div>

  <div class="header">
    <div class="brand">
      <div class="brand-logo">Hub<em>43</em></div>
      <div class="brand-sub">Workspace</div>
      <div class="brand-addr">
        43 Balogun Street, Ikeja, Lagos<br>
        info@hub43workspace.com<br>
        +234-800-HUB-43HQ
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-label">Invoice</div>
      <div class="inv-number">${invNum}</div>
      <div class="inv-dates">
        <strong>Invoice Date:</strong> ${fmtD(inv.date)}<br>
        <strong>Due Date:</strong> ${isPaid ? "Paid" : fmtD(inv.date)}
      </div>
    </div>
  </div>

  <div class="status-row">
    <span class="status-pill">
      ${isPaid
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Paid`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Payment Due`}
    </span>
  </div>

  <div class="body">
    <div class="address-row">
      <div class="address-block">
        <div class="addr-lbl">Billed To</div>
        <div class="addr-name">${user?.name || "Member"}</div>
        <div class="addr-detail">
          ${user?.email || ""}${user?.phone ? "<br>" + user.phone : ""}
        </div>
      </div>
      <div class="address-block">
        <div class="addr-lbl">From</div>
        <div class="addr-name">Hub43 Workspace Ltd</div>
        <div class="addr-detail">
          43 Balogun Street, Ikeja<br>
          Lagos, Nigeria
        </div>
      </div>
    </div>

    <div class="items-wrap">
      <table class="items-table">
        <thead>
          <tr>
            <th style="width:50%">Item</th>
            <th>Service</th>
            <th>Date</th>
            <th class="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="item-title">${inv.description}</div>
              <div class="item-sub">Invoice ${invNum}</div>
            </td>
            <td class="qty-cell">${inv.service}</td>
            <td class="price-cell">${fmtD(inv.date)}</td>
            <td class="amount-cell r">${fmt(inv.amount)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="totals-wrap">
      <table class="totals-table">
        <tr class="sub-row">
          <td>Subtotal</td>
          <td class="r">${fmt(inv.amount)}</td>
        </tr>
        <tr class="sub-row">
          <td style="color:#94A3B8;font-size:12px;">Tax (0%)</td>
          <td class="r" style="color:#94A3B8;font-size:12px;">&#8358;0</td>
        </tr>
        <tr class="total-row">
          <td>Total ${isPaid ? "Paid" : "Due"}</td>
          <td class="r">${fmt(inv.amount)}</td>
        </tr>
      </table>
    </div>

    ${isPaid ? `
    <div class="notes">
      <div class="notes-lbl">Note</div>
      <div class="notes-text">&#10003; Payment confirmed and received on ${fmtD(inv.date)}. This document serves as your official receipt. Please retain it for your records.</div>
    </div>` : `
    <div class="notes">
      <div class="notes-lbl">Payment Instructions</div>
      <div class="notes-text">Please make payment to: <strong>Hub43 Workspace Ltd</strong> · GTBank · Account No: 0123456789<br>Reference your invoice number <strong>${invNum}</strong> when making payment.</div>
    </div>`}
  </div>

  <div class="footer">
    <div class="footer-brand">Hub<em>43</em> Workspace</div>
    <div class="footer-copy">
      Work. Learn. Connect.<br>
      hub43workspace.com &nbsp;·&nbsp; Generated ${today}
    </div>
  </div>

  <div class="controls">
    <button class="btn btn-close" onclick="window.close()">Close</button>
    <button class="btn btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
  </div>
</div>
</body>
</html>`;

  // Use Blob + anchor download — avoids popup blocker issues
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Hub43_Invoice_${invNum}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    // Fallback: open in new tab (e.g. Safari iOS)
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }
};

// ─── INVOICES VIEW ────────────────────────────────────────────────────────────
const InvoicesView = ({ data, isAdmin, userId }) => {
  const [q, setQ] = useState("");
  const allInvs = isAdmin ? data.invoices : data.invoices.filter(i => i.userId === userId);
  const invs = allInvs.filter(inv => {
    if (!q) return true;
    const u = data.users.find(u => u.id === inv.userId);
    return inv.description.toLowerCase().includes(q.toLowerCase()) ||
      inv.id.toLowerCase().includes(q.toLowerCase()) ||
      inv.service.toLowerCase().includes(q.toLowerCase()) ||
      u?.name.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BRAND.blue }}>{isAdmin ? "All Invoices" : "My Invoices"}</h2>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search member, service, ID…"
          style={{ padding: "8px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, outline: "none", width: 240 }} />
      </div>
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {[isAdmin && "Member", "Invoice ID", "Description", "Date", "Amount", "Status", ""].filter(Boolean).map(h => (
              <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {invs.map(inv => {
              const u = data.users.find(u => u.id === inv.userId);
              return (
                <tr key={inv.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  {isAdmin && <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>{u?.name}</td>}
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#9CA3AF", fontFamily: "monospace" }}>{inv.id}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13 }}>{inv.description}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(inv.date)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(inv.amount)}</td>
                  <td style={{ padding: "12px 16px" }}><Badge status={inv.status} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <button onClick={() => downloadInvoicePDF(inv, u)} style={{ padding: "5px 10px", background: BRAND.lightBlue, color: BRAND.blue, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="download" size={12} color={BRAND.blue} /> Download
                    </button>
                  </td>
                </tr>
              );
            })}
            {invs.length === 0 && (
              <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: "24px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No invoices match your search</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── REVENUE VIEW ─────────────────────────────────────────────────────────────
const RevenueView = ({ data }) => {
  const byService = { hot_desk: 0, private_office: 0, meeting_room: 0, virtual_office: 0 };

  // Invoices (bookings)
  data.invoices.forEach(inv => {
    const key = inv.service === "Hot Desk" ? "hot_desk" : inv.service === "Meeting Room" ? "meeting_room" : inv.service === "Private Office" ? "private_office" : "virtual_office";
    byService[key] += inv.amount;
  });

  // Subscriptions (office & virtual)
  data.subscriptions.filter(s => s.status === "active").forEach(s => {
    if (s.service === "private_office") byService.private_office += s.amount;
    else if (s.service === "virtual_office") byService.virtual_office += s.amount;
  });

  const total = Object.values(byService).reduce((a, b) => a + b, 0);
  const totalTxns = data.invoices.length + data.subscriptions.filter(s => s.status === "active").length;
  const items = [
    { key: "hot_desk", label: "Hot Desk", color: BRAND.blue, icon: "desk" },
    { key: "private_office", label: "Private Office", color: BRAND.orange, icon: "office" },
    { key: "meeting_room", label: "Meeting Rooms", color: BRAND.red, icon: "meeting" },
    { key: "virtual_office", label: "Virtual Office", color: "#059669", icon: "virtual" },
  ];
  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Revenue Overview</h2>
      <div style={{ background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.darkBlue})`, borderRadius: 14, padding: "24px 28px", color: "#fff", marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "#93C5FD", marginBottom: 4 }}>TOTAL REVENUE</div>
        <div style={{ fontSize: 36, fontWeight: 900 }}>{formatNGN(total)}</div>
        <div style={{ fontSize: 13, color: "#BFDBFE", marginTop: 4 }}>All time · {data.invoices.length} invoices</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        {items.map(item => (
          <div key={item.key} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Icon name={item.icon} size={18} color={item.color} />
              <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{item.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>{formatNGN(byService[item.key])}</div>
            <div style={{ height: 4, background: "#F3F4F6", borderRadius: 2, marginTop: 10 }}>
              <div style={{ height: 4, background: item.color, borderRadius: 2, width: total > 0 ? `${(byService[item.key] / total) * 100}%` : "0%" }} />
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{total > 0 ? Math.round((byService[item.key] / total) * 100) : 0}% of total</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MY BOOKINGS ──────────────────────────────────────────────────────────────
const MyBookings = ({ user, data }) => {
  const myBookings = data.bookings.filter(b => b.userId === user.id);
  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>My Bookings</h2>
      {myBookings.length === 0 && <p style={{ color: "#9CA3AF" }}>No bookings yet.</p>}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {["Service", "Date", "Details", "Amount", "Status"].map(h => (
              <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {myBookings.map(b => (
              <tr key={b.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{b.service.replace("_", " ")}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(b.date)}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "#9CA3AF" }}>
                  {b.checkIn ? `${b.checkIn}–${b.checkOut} · ${b.hours}h` : b.startTime ? `${b.startTime}–${b.endTime}` : ""}
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(b.amount)}</td>
                <td style={{ padding: "12px 16px" }}><Badge status={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── NOTIFICATIONS PANEL ──────────────────────────────────────────────────────
const NotificationsPanel = ({ user, data, setData, onClose }) => {
  const notifs = data.notifications.filter(n => n.userId === user.id);
  const markRead = (id) => setData(d => ({ ...d, notifications: d.notifications.map(n => n.id === id ? { ...n, read: true } : n) }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 360, background: "#fff", height: "100vh", overflow: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: BRAND.blue }}>Notifications</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 16 }}>
          {notifs.length === 0 && <p style={{ color: "#9CA3AF", fontSize: 13 }}>No notifications.</p>}
          {notifs.map(n => (
            <div key={n.id} onClick={() => markRead(n.id)} style={{ padding: "14px", borderRadius: 10, marginBottom: 10, background: n.read ? "#F9FAFB" : BRAND.lightBlue, cursor: "pointer", borderLeft: `3px solid ${n.read ? "#E5E7EB" : BRAND.orange}` }}>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{n.message}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>{formatDate(n.date)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN: WIFI SETTINGS ────────────────────────────────────────────────────
const AdminWifiSettings = ({ data, setData }) => {
  const [ssid, setSsid] = useState(data.wifi.ssid);
  const [password, setPassword] = useState(data.wifi.password);
  const [showPass, setShowPass] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!ssid.trim() || !password.trim()) return;
    setData(d => ({ ...d, wifi: { ssid: ssid.trim(), password: password.trim() } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB",
    borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>WiFi Settings</h2>
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>Update the WiFi credentials shown to approved Hot Desk members.</p>

      {saved && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
          <Icon name="check" size={16} color="#16A34A" /> WiFi credentials updated! Members will see the new details on their next approved booking.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 700 }}>
        {/* Edit form */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <Icon name="wifi" size={18} color={BRAND.blue} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Update Credentials</span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Network Name (SSID)</label>
            <input
              value={ssid}
              onChange={e => setSsid(e.target.value)}
              placeholder="e.g. Hub43-Workspace-5G"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                placeholder="WiFi password"
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <button
                onClick={() => setShowPass(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12, fontWeight: 600 }}
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!ssid.trim() || !password.trim()}
            style={{ width: "100%", padding: "11px", background: !ssid.trim() || !password.trim() ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: !ssid.trim() || !password.trim() ? "not-allowed" : "pointer" }}
          >
            Save WiFi Credentials
          </button>
        </div>

        {/* Live preview */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Live Preview — What Members See</div>
          <div style={{ background: BRAND.lightBlue, border: `2px solid ${BRAND.blue}44`, borderRadius: 14, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Icon name="wifi" size={20} color={BRAND.blue} />
              <span style={{ fontWeight: 800, color: BRAND.blue, fontSize: 14 }}>WiFi Access</span>
              <span style={{ marginLeft: "auto", background: "#DCFCE7", color: "#16A34A", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>ACTIVE</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Network Name</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{ssid || <span style={{ color: "#D1D5DB" }}>Network name…</span>}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Password</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111", letterSpacing: "0.06em", background: "#fff", borderRadius: 6, padding: "6px 10px", display: "inline-block" }}>{password || <span style={{ color: "#D1D5DB", letterSpacing: 0 }}>Password…</span>}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: BRAND.red }} />
              <span style={{ fontSize: 11, color: "#6B7280" }}>Do not share this password</span>
            </div>
          </div>
          <div style={{ marginTop: 12, background: BRAND.lightOrange, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: BRAND.orange }}>
            <strong>Note:</strong> Changes apply immediately. Members with active approved bookings will see the updated credentials on their dashboard.
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN: PRICING ──────────────────────────────────────────────────────────
const AdminPricing = ({ data, setData }) => {
  const [editing, setEditing] = useState(null); // { type, id, field, value }
  const [saved, setSaved] = useState(null);

  const startEdit = (type, id, field, value) => setEditing({ type, id, field, value: String(value) });

  const commitEdit = () => {
    if (!editing) return;
    const val = parseInt(editing.value.replace(/[^0-9]/g, ""), 10);
    if (isNaN(val) || val <= 0) { setEditing(null); return; }

    if (editing.type === "hotdesk") {
      setData(d => ({ ...d, hotDeskPricing: { ...d.hotDeskPricing, [editing.field]: val } }));
    } else if (editing.type === "virtual_office") {
      setData(d => ({
        ...d,
        plans: {
          ...d.plans,
          virtual_office: d.plans.virtual_office.map(p =>
            p.id === editing.id ? { ...p, [editing.field]: val } : p
          ),
        },
      }));
    } else if (editing.type === "office_pricing") {
      setData(d => ({
        ...d,
        offices: d.offices.map(o =>
          o.id === editing.id ? { ...o, pricing: { ...o.pricing, [editing.field]: val } } : o
        ),
      }));
    } else if (editing.type === "meeting_room") {
      setData(d => ({
        ...d,
        meetingRooms: d.meetingRooms.map(r =>
          r.id === editing.id ? { ...r, pricing: { ...r.pricing, [editing.field]: val } } : r
        ),
      }));
    }
    setSaved(editing.type + editing.id + editing.field);
    setTimeout(() => setSaved(null), 2000);
    setEditing(null);
  };

  const inputStyle = {
    border: `1.5px solid ${BRAND.blue}`, borderRadius: 7, padding: "6px 10px",
    fontSize: 13, fontWeight: 700, width: 140, outline: "none", color: BRAND.blue,
  };

  const PriceCell = ({ type, id, field, value, label }) => {
    const isThis = editing && editing.type === type && editing.id === id && editing.field === field;
    const wasSaved = saved === type + id + field;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isThis ? (
          <>
            <span style={{ fontSize: 12, color: "#6B7280" }}>₦</span>
            <input
              autoFocus
              value={editing.value}
              onChange={e => setEditing(ed => ({ ...ed, value: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }}
              style={inputStyle}
            />
            <button onClick={commitEdit} style={{ padding: "5px 10px", background: "#DCFCE7", color: "#16A34A", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Save</button>
            <button onClick={() => setEditing(null)} style={{ padding: "5px 10px", background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.blue, minWidth: 100 }}>{formatNGN(value)}</span>
            {wasSaved && <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>✓ Saved</span>}
            <button
              onClick={() => startEdit(type, id, field, value)}
              style={{ padding: "4px 10px", background: BRAND.lightBlue, color: BRAND.blue, border: `1px solid ${BRAND.blue}33`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              Edit
            </button>
          </>
        )}
      </div>
    );
  };

  const sectionStyle = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 24 };
  const headStyle = { padding: "14px 20px", borderBottom: "1px solid #F3F4F6", background: "#F9FAFB", display: "flex", alignItems: "center", gap: 10 };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>💰 Pricing Management</h2>
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>Update prices for all Hub43 services. Changes take effect immediately for new bookings.</p>

      {/* Hot Desk */}
      <div style={sectionStyle}>
        <div style={headStyle}>
          <Icon name="desk" size={18} color={BRAND.orange} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Hot Desk</span>
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>— Hourly, Daily & Monthly rates</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {["Plan", "Description", "Price"].map(h => (
              <th key={h} style={{ padding: "10px 20px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[
              { id: "hourly",  label: "Hourly",  desc: "Per hour · any extra minute = +1 hr" },
              { id: "daily",   label: "Daily",   desc: "Full day access (9am – 5pm)" },
              { id: "monthly", label: "Monthly", desc: "30-day unlimited access" },
            ].map(plan => (
              <tr key={plan.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 700 }}>{plan.label}</td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: "#6B7280" }}>{plan.desc}</td>
                <td style={{ padding: "14px 20px" }}>
                  <PriceCell type="hotdesk" id="hotdesk" field={plan.id} value={data.hotDeskPricing[plan.id]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Private Office Plans — per office */}
      <div style={sectionStyle}>
        <div style={headStyle}>
          <Icon name="office" size={18} color={BRAND.blue} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Private Office Pricing</span>
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>— each office has its own rates</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB" }}>
              <th style={{ padding: "10px 20px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>Office</th>
              {PLAN_TIERS.map(t => (
                <th key={t.id} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.offices.map(office => (
              <tr key={office.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                <td style={{ padding: "14px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{office.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{office.floor} · Cap. {office.capacity}</div>
                </td>
                {PLAN_TIERS.map(tier => (
                  <td key={tier.id} style={{ padding: "14px 14px" }}>
                    <PriceCell type="office_pricing" id={office.id} field={tier.id} value={office.pricing[tier.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Virtual Office Plans */}
      <div style={sectionStyle}>
        <div style={headStyle}>
          <Icon name="virtual" size={18} color={BRAND.blue} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Virtual Office Plans</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {["Plan", "Duration", "Price"].map(h => (
              <th key={h} style={{ padding: "10px 20px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.plans.virtual_office.map(plan => (
              <tr key={plan.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 700 }}>{plan.label}</td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: "#6B7280" }}>{plan.days} days</td>
                <td style={{ padding: "14px 20px" }}>
                  <PriceCell type="virtual_office" id={plan.id} field="price" value={plan.price} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Meeting Room */}
      <div style={sectionStyle}>
        <div style={headStyle}>
          <Icon name="meeting" size={18} color={BRAND.orange} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Meeting Room</span>
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>— Hourly, Half-Day & Full-Day rates</span>
        </div>
        {data.meetingRooms.map(room => (
          <div key={room.id}>
            <div style={{ padding: "12px 20px 6px", fontSize: 12, color: "#6B7280", borderTop: "1px solid #F3F4F6" }}>
              <strong style={{ color: "#111" }}>{room.name}</strong> · {room.floor} · {room.capacity} people
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#F9FAFB" }}>
                {["Plan", "Duration", "Price"].map(h => (
                  <th key={h} style={{ padding: "8px 20px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {MEETING_PLANS.map(plan => (
                  <tr key={plan.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "13px 20px", fontSize: 13, fontWeight: 700 }}>{plan.label}</td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "#6B7280" }}>{plan.desc}</td>
                    <td style={{ padding: "13px 20px" }}>
                      <PriceCell type="meeting_room" id={room.id} field={plan.id} value={room.pricing[plan.id]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div style={{ background: BRAND.lightBlue, borderRadius: 10, padding: "12px 16px", fontSize: 12, color: BRAND.blue }}>
        💡 <strong>Note:</strong> Price changes apply to new bookings and subscriptions only. Existing active subscriptions retain their original pricing.
      </div>
    </div>
  );
};

// ─── FRONT DESK ───────────────────────────────────────────────────────────────

// Simulate sending an email — returns a formatted "email preview" string
const simulateEmail = ({ name, email, service, plan, amount, invoiceId, date, details }) => ({
  to: email,
  subject: `Hub43 — Welcome, ${name}! Your ${service} is confirmed`,
  body: `Hi ${name},

Thank you for choosing Hub43 Workspace! Your booking has been confirmed and processed at our front desk.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INVOICE #${invoiceId}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Service:    ${service}
  Plan:       ${plan}
  Date:       ${date}
  Amount:     ₦${Number(amount).toLocaleString("en-NG")}
  Status:     PAID
${details ? `\n  Details:    ${details}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your registered address (Virtual Office):
  43 Balogun Street, Lagos Island, Lagos

If you have any questions, reply to this email or visit the front desk.

Warm regards,
Hub43 Workspace Team
work@hub43.com | +234-800-HUB-43HQ
`,
});

const SERVICE_OPTIONS = [
  { key: "hot_desk", label: "Hot Desk", icon: "desk", color: "#1E3A8A" },
  { key: "private_office", label: "Private Office", icon: "office", color: "#E07B2A" },
  { key: "meeting_room", label: "Meeting Room", icon: "meeting", color: "#7C3AED" },
  { key: "virtual_office", label: "Virtual Office", icon: "virtual", color: "#059669" },
];

const FrontDeskOnboard = ({ data, setData, staffName }) => {
  const today = new Date().toISOString().split("T")[0];

  // Step 1: member info. Step 2: service. Step 3: plan/details. Step 4: confirm. Step 5: success
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [service, setService] = useState(null);
  const [plan, setPlan] = useState(null);
  const [extra, setExtra] = useState({}); // date, hours, officeId, roomId, etc.
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // { invoice, emailPreview, userName }
  const [errors, setErrors] = useState({});
  const [showEmail, setShowEmail] = useState(false);

  const reset = () => { setStep(1); setForm({ name: "", email: "", phone: "" }); setService(null); setPlan(null); setExtra({}); setResult(null); setErrors({}); setShowEmail(false); };

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateStep1 = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = "Valid email required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Derive pricing label and amount for the chosen service+plan
  const getPlanDetails = () => {
    if (!service || !plan) return { label: "", amount: 0, description: "" };
    if (service === "hot_desk") {
      const p = { hourly: data.hotDeskPricing.hourly, daily: data.hotDeskPricing.daily, monthly: data.hotDeskPricing.monthly };
      const hrs = extra.hours || 1;
      if (plan === "hourly") return { label: `Hourly (${hrs}h)`, amount: p.hourly * hrs, description: `Hot Desk — ${hrs} hour${hrs !== 1 ? "s" : ""} on ${extra.date || today}` };
      if (plan === "daily") return { label: "Daily", amount: p.daily, description: `Hot Desk — Full day on ${extra.date || today}` };
      if (plan === "monthly") return { label: "Monthly (30 days)", amount: p.monthly, description: `Hot Desk — 30-day pass from ${extra.date || today}` };
    }
    if (service === "private_office") {
      const office = data.offices.find(o => o.id === extra.officeId);
      if (!office) return { label: "", amount: 0, description: "" };
      const price = office.pricing[plan] || 0;
      const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
      return { label: planLabel, amount: price, description: `${office.name} (${office.floor}) — ${planLabel}` };
    }
    if (service === "meeting_room") {
      const room = data.meetingRooms.find(r => r.id === extra.roomId);
      if (!room) return { label: "", amount: 0, description: "" };
      const priceMap = { hourly: room.pricing.hourly, halfDay: room.pricing.halfDay, fullDay: room.pricing.fullDay };
      const hrs = extra.hours || 1;
      if (plan === "hourly") return { label: `Hourly (${hrs}h)`, amount: priceMap.hourly * hrs, description: `${room.name} — ${hrs}h on ${extra.date || today}` };
      if (plan === "halfDay") return { label: "Half Day", amount: priceMap.halfDay, description: `${room.name} — Half Day on ${extra.date || today}` };
      if (plan === "fullDay") return { label: "Full Day", amount: priceMap.fullDay, description: `${room.name} — Full Day on ${extra.date || today}` };
    }
    if (service === "virtual_office") {
      const vp = data.plans.virtual_office.find(p => p.id === plan);
      if (!vp) return { label: "", amount: 0, description: "" };
      return { label: vp.label, amount: vp.price, description: `Virtual Office — ${vp.label}` };
    }
    return { label: "", amount: 0, description: "" };
  };

  const handleConfirm = () => {
    const { label, amount, description } = getPlanDetails();
    if (!amount) return;
    setProcessing(true);
    setTimeout(() => {
      const invoiceId = "INV-" + Date.now().toString().slice(-6);
      const userId = "u" + Date.now();
      const newUser = { id: userId, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || "—", role: "member", joined: today };
      const invRecord = { id: invoiceId.toLowerCase(), userId, amount, date: today, status: "paid", service: SERVICE_OPTIONS.find(s => s.key === service)?.label || service, description };

      // Build subscription or booking record
      let newSub = null, newBooking = null;
      if (service === "virtual_office" || service === "private_office") {
        const days = service === "virtual_office" ? (data.plans.virtual_office.find(p => p.id === plan)?.days || 180) : OFFICE_PLAN_DAYS[plan] || 30;
        const end = new Date(); end.setDate(end.getDate() + days);
        newSub = { id: "s" + Date.now(), userId, service, plan, startDate: today, endDate: end.toISOString().split("T")[0], status: "active", amount, ...(extra.officeId ? { officeId: extra.officeId } : {}) };
        if (extra.officeId) {
          // Mark office occupied
          setData(d => ({ ...d, offices: d.offices.map(o => o.id === extra.officeId ? { ...o, status: "occupied", assignedTo: userId } : o) }));
        }
      } else {
        newBooking = { id: "b" + Date.now(), userId, service, plan, date: extra.date || today, status: "approved", amount, invoiceId: invoiceId.toLowerCase(), description, ...(extra.hours ? { hours: extra.hours } : {}), ...(extra.roomId ? { roomId: extra.roomId } : {}) };
      }

      const welcomeNotif = { id: "n" + Date.now(), userId, type: "info", message: `🎉 Welcome to Hub43! Your ${SERVICE_OPTIONS.find(s => s.key === service)?.label} has been set up by our front desk team.`, read: false, date: today };

      setData(d => ({
        ...d,
        users: [...d.users, newUser],
        invoices: [...d.invoices, invRecord],
        subscriptions: newSub ? [...d.subscriptions, newSub] : d.subscriptions,
        bookings: newBooking ? [...d.bookings, newBooking] : d.bookings,
        notifications: [...d.notifications, welcomeNotif],
      }));

      const emailPreview = simulateEmail({ name: form.name.trim(), email: form.email.trim(), service: SERVICE_OPTIONS.find(s => s.key === service)?.label, plan: label, amount, invoiceId, date: today, details: description });
      setResult({ invoice: invRecord, emailPreview, userName: form.name.trim() });
      setProcessing(false);
      setStep(5);
    }, 1400);
  };

  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const errStyle = { fontSize: 11, color: BRAND.red, marginTop: 4 };

  const { label: planLabel, amount, description: planDesc } = getPlanDetails();

  // ── Step indicators ──
  const steps = ["Member Info", "Service", "Plan & Details", "Confirm"];
  const StepBar = () => (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
      {steps.map((s, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? "#059669" : active ? BRAND.blue : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: done || active ? "#fff" : "#9CA3AF", transition: "all .2s" }}>
                {done ? <Icon name="check" size={12} color="#fff" /> : idx}
              </div>
              <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? BRAND.blue : done ? "#059669" : "#9CA3AF", whiteSpace: "nowrap" }}>{s}</span>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "#059669" : "#E5E7EB", margin: "0 10px", minWidth: 16, transition: "all .2s" }} />}
          </div>
        );
      })}
    </div>
  );

  // ── Step 1: Member Info ──
  if (step === 1) return (
    <div>
      <StepBar />
      <div style={{ maxWidth: 480 }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 800, color: "#111" }}>Enter Member Details</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Full Name <span style={{ color: BRAND.red }}>*</span></label>
          <input value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Amaka Osei" style={{ ...inputStyle, borderColor: errors.name ? BRAND.red : "#E5E7EB" }} />
          {errors.name && <div style={errStyle}>{errors.name}</div>}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email Address <span style={{ color: BRAND.red }}>*</span></label>
          <input value={form.email} onChange={e => setF("email", e.target.value)} type="email" placeholder="amaka@company.com" style={{ ...inputStyle, borderColor: errors.email ? BRAND.red : "#E5E7EB" }} />
          {errors.email && <div style={errStyle}>{errors.email}</div>}
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Invoice and access details will be sent here.</div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Phone Number <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span></label>
          <input value={form.phone} onChange={e => setF("phone", e.target.value)} placeholder="+234-800-000-0000" style={inputStyle} />
        </div>
        <button onClick={() => { if (validateStep1()) setStep(2); }} style={{ padding: "11px 28px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Next — Choose Service →
        </button>
      </div>
    </div>
  );

  // ── Step 2: Service ──
  if (step === 2) return (
    <div>
      <StepBar />
      <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 800, color: "#111" }}>Select Service for <span style={{ color: BRAND.blue }}>{form.name}</span></h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, maxWidth: 680, marginBottom: 24 }}>
        {SERVICE_OPTIONS.map(s => (
          <button key={s.key} onClick={() => { setService(s.key); setPlan(null); setExtra({}); }} style={{ padding: "20px 16px", background: service === s.key ? s.color + "12" : "#fff", border: `2px solid ${service === s.key ? s.color : "#E5E7EB"}`, borderRadius: 12, cursor: "pointer", textAlign: "left", transition: "all .15s" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color + "15", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Icon name={s.icon} size={22} color={s.color} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: service === s.key ? s.color : "#111" }}>{s.label}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setStep(1)} style={{ padding: "11px 20px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Back</button>
        <button onClick={() => { if (service) setStep(3); }} disabled={!service} style={{ padding: "11px 28px", background: service ? BRAND.blue : "#9CA3AF", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: service ? "pointer" : "not-allowed" }}>
          Next — Plan & Details →
        </button>
      </div>
    </div>
  );

  // ── Step 3: Plan & Details ──
  if (step === 3) {
    const svcInfo = SERVICE_OPTIONS.find(s => s.key === service);
    const availableOffices = data.offices.filter(o => o.status === "available");

    const PlanCard = ({ id, label, price, desc }) => (
      <button onClick={() => setPlan(id)} style={{ padding: "14px 16px", background: plan === id ? svcInfo.color + "10" : "#fff", border: `2px solid ${plan === id ? svcInfo.color : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "all .15s" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: plan === id ? svcInfo.color : "#111" }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111", marginTop: 2 }}>{formatNGN(price)}</div>
        {desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{desc}</div>}
      </button>
    );

    return (
      <div>
        <StepBar />
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: "#111" }}>
          <span style={{ color: svcInfo.color }}>●</span> {svcInfo.label} — Plan & Details
        </h3>
        <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13 }}>For <strong>{form.name}</strong> · {form.email}</p>

        {service === "hot_desk" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" value={extra.date || today} onChange={e => setExtra(x => ({ ...x, date: e.target.value }))} style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, maxWidth: 560, marginBottom: 16 }}>
              <PlanCard id="hourly" label="Hourly" price={data.hotDeskPricing.hourly} desc="per hour" />
              <PlanCard id="daily" label="Daily" price={data.hotDeskPricing.daily} desc="9am – 5pm" />
              <PlanCard id="monthly" label="Monthly" price={data.hotDeskPricing.monthly} desc="30-day pass" />
            </div>
            {plan === "hourly" && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Number of Hours</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setExtra(x => ({ ...x, hours: Math.max(1, (x.hours || 1) - 1) }))} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <span style={{ fontSize: 18, fontWeight: 800, minWidth: 32, textAlign: "center" }}>{extra.hours || 1}</span>
                  <button onClick={() => setExtra(x => ({ ...x, hours: (x.hours || 1) + 1 }))} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>= {formatNGN(data.hotDeskPricing.hourly * (extra.hours || 1))}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {service === "private_office" && (
          <div>
            {availableOffices.length === 0 ? (
              <div style={{ background: "#FFF0EF", borderRadius: 10, padding: 16, marginBottom: 16, color: BRAND.red, fontSize: 13 }}>⚠ No available offices right now. All offices are currently occupied.</div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Select Office</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
                    {availableOffices.map(o => (
                      <button key={o.id} onClick={() => setExtra(x => ({ ...x, officeId: o.id }))} style={{ padding: "12px 16px", background: extra.officeId === o.id ? BRAND.orange + "10" : "#fff", border: `2px solid ${extra.officeId === o.id ? BRAND.orange : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{o.name} — {o.floor}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>Capacity: {o.capacity} people</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Plan</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, maxWidth: 560 }}>
                    {extra.officeId && ["daily", "monthly", "quarterly", "yearly"].map(p => {
                      const office = data.offices.find(o => o.id === extra.officeId);
                      return <PlanCard key={p} id={p} label={p.charAt(0).toUpperCase() + p.slice(1)} price={office?.pricing[p] || 0} />;
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {service === "meeting_room" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Select Room</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
                {data.meetingRooms.map(r => (
                  <button key={r.id} onClick={() => setExtra(x => ({ ...x, roomId: r.id }))} style={{ padding: "12px 16px", background: extra.roomId === r.id ? "#7C3AED10" : "#fff", border: `2px solid ${extra.roomId === r.id ? "#7C3AED" : "#E5E7EB"}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{r.floor} · {r.capacity} people</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" value={extra.date || today} onChange={e => setExtra(x => ({ ...x, date: e.target.value }))} style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
            {extra.roomId && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, maxWidth: 480, marginBottom: 16 }}>
                {(() => {
                  const room = data.meetingRooms.find(r => r.id === extra.roomId);
                  return [
                    <PlanCard key="hourly" id="hourly" label="Hourly" price={room.pricing.hourly} desc="per hour" />,
                    <PlanCard key="halfDay" id="halfDay" label="Half Day" price={room.pricing.halfDay} desc="~4 hours" />,
                    <PlanCard key="fullDay" id="fullDay" label="Full Day" price={room.pricing.fullDay} desc="8 hours" />,
                  ];
                })()}
              </div>
            )}
            {plan === "hourly" && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Number of Hours</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setExtra(x => ({ ...x, hours: Math.max(1, (x.hours || 1) - 1) }))} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <span style={{ fontSize: 18, fontWeight: 800, minWidth: 32, textAlign: "center" }}>{extra.hours || 1}</span>
                  <button onClick={() => setExtra(x => ({ ...x, hours: (x.hours || 1) + 1 }))} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
              </div>
            )}
          </div>
        )}

        {service === "virtual_office" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, maxWidth: 420, marginBottom: 16 }}>
            {data.plans.virtual_office.map(p => (
              <PlanCard key={p.id} id={p.id} label={p.label} price={p.price} desc={`${p.days} days`} />
            ))}
          </div>
        )}

        {/* Amount preview */}
        {plan && amount > 0 && (
          <div style={{ background: BRAND.lightBlue, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 480 }}>
            <span style={{ fontSize: 13, color: "#374151" }}>{planDesc}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: BRAND.blue }}>{formatNGN(amount)}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(2)} style={{ padding: "11px 20px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Back</button>
          <button onClick={() => { if (plan && amount > 0) setStep(4); }} disabled={!plan || !amount} style={{ padding: "11px 28px", background: plan && amount > 0 ? BRAND.blue : "#9CA3AF", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: plan && amount > 0 ? "pointer" : "not-allowed" }}>
            Next — Review & Confirm →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4: Confirm ──
  if (step === 4) {
    const svcInfo = SERVICE_OPTIONS.find(s => s.key === service);
    const rows = [
      ["Member Name", form.name],
      ["Email", form.email],
      form.phone && ["Phone", form.phone],
      ["Service", svcInfo.label],
      ["Plan", planLabel],
      ["Description", planDesc],
      ["Amount", formatNGN(amount)],
      ["Payment", "Cash / POS (collected at front desk)"],
      ["Date", formatDate(today)],
    ].filter(Boolean);
    return (
      <div>
        <StepBar />
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800, color: "#111" }}>Review & Confirm</h3>
        <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13 }}>Please verify all details before confirming. An invoice will be sent to {form.email}.</p>

        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, overflow: "hidden", maxWidth: 520, marginBottom: 20 }}>
          <div style={{ background: BRAND.blue, padding: "14px 20px", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name={svcInfo.icon} size={16} color="#93C5FD" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{svcInfo.label} Onboarding Summary</span>
          </div>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 20px", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: k === "Amount" ? BRAND.blue : "#111" }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background: BRAND.lightOrange, borderRadius: 10, padding: "12px 16px", maxWidth: 520, marginBottom: 24, fontSize: 12, color: BRAND.orange }}>
          <strong>📧 Email confirmation</strong> will be sent automatically to <strong>{form.email}</strong> with the invoice and access details.
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(3)} style={{ padding: "11px 20px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Back</button>
          <button onClick={handleConfirm} disabled={processing} style={{ padding: "11px 28px", background: processing ? "#9CA3AF" : "#059669", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: processing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            {processing ? "Processing…" : <><Icon name="check" size={16} color="#fff" /> Confirm & Send Invoice</>}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 5: Success ──
  if (step === 5 && result) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ background: "linear-gradient(135deg, #059669, #047857)", borderRadius: 16, padding: "28px 32px", color: "#fff", marginBottom: 24, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, background: "rgba(255,255,255,0.2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Icon name="check" size={28} color="#fff" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Onboarding Complete!</div>
          <div style={{ fontSize: 14, color: "#A7F3D0" }}>{result.userName} has been registered and invoiced.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Invoice #{result.invoice.id.toUpperCase()}</span>
            <Badge status="paid" />
          </div>
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>{result.invoice.description}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: BRAND.blue }}>{formatNGN(result.invoice.amount)}</div>
        </div>

        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Icon name="check" size={14} color="#16A34A" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>Email Sent to {result.emailPreview.to}</span>
          </div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 10 }}>Subject: <em>{result.emailPreview.subject}</em></div>
          <button onClick={() => setShowEmail(v => !v)} style={{ fontSize: 12, color: BRAND.blue, background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}>
            {showEmail ? "▲ Hide email preview" : "▼ Show email preview"}
          </button>
          {showEmail && (
            <pre style={{ marginTop: 12, fontSize: 12, color: "#374151", background: "#fff", borderRadius: 8, padding: 16, whiteSpace: "pre-wrap", fontFamily: "'Courier New', monospace", lineHeight: 1.6, border: "1px solid #E5E7EB", maxHeight: 320, overflow: "auto" }}>
              {result.emailPreview.body}
            </pre>
          )}
        </div>

        <button onClick={reset} style={{ padding: "12px 28px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="plus" size={16} color="#fff" /> Onboard Another Member
        </button>
      </div>
    );
  }

  return null;
};

// ── Front Desk: Today's Check-ins ──
const FrontDeskCheckins = ({ data }) => {
  const today = new Date().toISOString().split("T")[0];
  const todayBookings = data.bookings.filter(b => b.date === today);
  const todaySubs = data.subscriptions.filter(s => s.status === "active" && s.startDate === today);

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Today's Check-ins</h2>
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>{formatDate(today)} · {todayBookings.length + todaySubs.length} activity{todayBookings.length + todaySubs.length !== 1 ? "s" : ""} today</p>

      {todayBookings.length === 0 && todaySubs.length === 0 && (
        <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 32, textAlign: "center", border: "2px dashed #E5E7EB" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 14, color: "#9CA3AF" }}>No bookings or new subscriptions for today.</div>
        </div>
      )}

      {todaySubs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>New Subscriptions Today</div>
          {todaySubs.map(s => {
            const u = data.users.find(u => u.id === s.userId);
            const svc = SERVICE_OPTIONS.find(sv => sv.key === s.service);
            return (
              <div key={s.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: (svc?.color || BRAND.blue) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: svc?.color || BRAND.blue, flexShrink: 0 }}>{u?.name?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{u?.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u?.email}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: svc?.color || BRAND.blue }}>{svc?.label}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "capitalize" }}>{s.plan} · {formatNGN(s.amount)}</div>
                </div>
                <Badge status="active" />
              </div>
            );
          })}
        </div>
      )}

      {todayBookings.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Bookings Today</div>
          {todayBookings.map(b => {
            const u = data.users.find(u => u.id === b.userId);
            const svc = SERVICE_OPTIONS.find(sv => sv.key === b.service);
            return (
              <div key={b.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: (svc?.color || BRAND.blue) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: svc?.color || BRAND.blue, flexShrink: 0 }}>{u?.name?.[0] || "?"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{u?.name || "Walk-in"}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{b.description || svc?.label}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(b.amount)}</div>
                </div>
                <Badge status={b.status} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Front Desk: Members list (read-only) ──
const FrontDeskMembers = ({ data }) => {
  const [search, setSearch] = useState("");
  const members = data.users.filter(u => u.role === "member" && (
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  ));
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>All Members</h2>
      <p style={{ margin: "0 0 16px", color: "#6B7280", fontSize: 13 }}>{data.users.filter(u => u.role === "member").length} registered members</p>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ width: "100%", maxWidth: 360, padding: "9px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, outline: "none", marginBottom: 16, boxSizing: "border-box" }} />
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {["Name", "Email", "Phone", "Joined", "Active Subs"].map(h => (
              <th key={h} style={{ padding: "11px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>No members found.</td></tr>}
            {members.map(u => (
              <tr key={u.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: BRAND.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: BRAND.orange }}>{u.name[0]}</div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ padding: "11px 16px", fontSize: 13, color: "#6B7280" }}>{u.email}</td>
                <td style={{ padding: "11px 16px", fontSize: 13, color: "#6B7280" }}>{u.phone}</td>
                <td style={{ padding: "11px 16px", fontSize: 13, color: "#6B7280" }}>{formatDate(u.joined)}</td>
                <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{data.subscriptions.filter(s => s.userId === u.id && s.status === "active").length} active</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── SHARED: PAYMENT SELECTOR ────────────────────────────────────────────────
// Used inside booking/subscribe flows — shows only enabled payment methods
const PaymentSelector = ({ paymentMethods, amount, selected, onChange, paying }) => {
  const hasBank = paymentMethods?.bankTransfer;
  const hasPaystack = paymentMethods?.paystack;
  const bd = paymentMethods?.bankDetails || {};

  // Auto-select if only one option
  useEffect(() => {
    if (hasBank && !hasPaystack && selected !== "bank") onChange("bank");
    if (!hasBank && hasPaystack && selected !== "paystack") onChange("paystack");
  }, [hasBank, hasPaystack]);

  if (!hasBank && !hasPaystack) {
    return (
      <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: BRAND.red }}>
        ⚠ No payment methods are currently enabled. Please contact the front desk.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Select Payment Method</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hasBank && (
          <div onClick={() => !paying && onChange("bank")}
            style={{ border: `2px solid ${selected === "bank" ? BRAND.blue : "#E5E7EB"}`, borderRadius: 10, padding: "12px 14px", cursor: paying ? "default" : "pointer", background: selected === "bank" ? BRAND.lightBlue : "#fff", transition: "all .15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selected === "bank" ? BRAND.blue : "#D1D5DB"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {selected === "bank" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: BRAND.blue }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: selected === "bank" ? BRAND.blue : "#111" }}>🏦 Bank Transfer</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>Pay directly to Hub43's bank account</div>
              </div>
            </div>
            {selected === "bank" && (
              <div style={{ marginTop: 12, background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #E5E7EB" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.bankName || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111", letterSpacing: "0.08em" }}>{bd.accountNumber || "—"}</div>
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.accountName || "—"}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, background: BRAND.lightOrange, borderRadius: 6, padding: "8px 10px", fontSize: 11, color: BRAND.orange }}>
                  Use your <strong>name + invoice amount</strong> as payment reference. Send proof to the front desk.
                </div>
              </div>
            )}
          </div>
        )}

        {hasPaystack && (
          <div onClick={() => !paying && onChange("paystack")}
            style={{ border: `2px solid ${selected === "paystack" ? "#00C3F7" : "#E5E7EB"}`, borderRadius: 10, padding: "12px 14px", cursor: paying ? "default" : "pointer", background: selected === "paystack" ? "#F0FBFF" : "#fff", transition: "all .15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selected === "paystack" ? "#00C3F7" : "#D1D5DB"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {selected === "paystack" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00C3F7" }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: selected === "paystack" ? "#0099CC" : "#111" }}>💳 Online — Paystack</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>Card, USSD, bank transfer (instant)</div>
              </div>
              <div style={{ marginLeft: "auto", background: "#E0F7FF", color: "#0099CC", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8 }}>INSTANT</div>
            </div>
            {selected === "paystack" && (
              <div style={{ marginTop: 10, background: "#E0F7FF", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#0099CC" }}>
                You'll be redirected to Paystack's secure checkout to complete your {formatNGN(amount)} payment.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── ADMIN: PAYMENT SETTINGS ─────────────────────────────────────────────────
const AdminPaymentSettings = ({ data, setData }) => {
  const pm = data.paymentMethods;
  const [bankName, setBankName] = useState(pm.bankDetails.bankName);
  const [accountNumber, setAccountNumber] = useState(pm.bankDetails.accountNumber);
  const [accountName, setAccountName] = useState(pm.bankDetails.accountName);
  const [paystackKey, setPaystackKey] = useState(pm.paystackKey || "");
  const [saved, setSaved] = useState(false);

  const toggle = (key) => {
    // Prevent disabling both
    const next = { ...pm, [key]: !pm[key] };
    if (!next.bankTransfer && !next.paystack) return;
    setData(d => ({ ...d, paymentMethods: next }));
  };

  const saveBankDetails = () => {
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) return;
    setData(d => ({ ...d, paymentMethods: { ...d.paymentMethods, bankDetails: { bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() }, paystackKey: paystackKey.trim() } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const ToggleCard = ({ id, label, icon, color, bg, desc, enabled }) => (
    <div style={{ background: "#fff", border: `2px solid ${enabled ? color : "#E5E7EB"}`, borderRadius: 14, padding: 20, transition: "all .2s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: enabled ? bg : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, transition: "all .2s" }}>{icon}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: enabled ? "#111" : "#9CA3AF" }}>{label}</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{desc}</div>
          </div>
        </div>
        {/* Toggle switch */}
        <div onClick={() => toggle(id)} style={{ cursor: "pointer", flexShrink: 0 }}>
          <div style={{ width: 48, height: 26, borderRadius: 13, background: enabled ? color : "#D1D5DB", transition: "background .2s", position: "relative", display: "flex", alignItems: "center", padding: "0 3px" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transform: enabled ? "translateX(22px)" : "translateX(0)", transition: "transform .2s" }} />
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, textAlign: "center", marginTop: 3, color: enabled ? color : "#9CA3AF" }}>{enabled ? "ON" : "OFF"}</div>
        </div>
      </div>
      {!enabled && (
        <div style={{ marginTop: 12, background: "#F9FAFB", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#9CA3AF" }}>
          This payment method is disabled. Members will not see it during checkout.
        </div>
      )}
    </div>
  );

  const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Payment Settings</h2>
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>Enable or disable payment methods shown to members at checkout. At least one must remain active.</p>

      {saved && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
          <Icon name="check" size={16} color="#16A34A" /> Bank details saved successfully!
        </div>
      )}

      {/* Status banner */}
      <div style={{ background: BRAND.lightBlue, borderRadius: 12, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="invoice" size={18} color={BRAND.blue} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>
            Active: {[pm.bankTransfer && "Bank Transfer", pm.paystack && "Paystack"].filter(Boolean).join(" + ")}
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>Members will see {pm.bankTransfer && pm.paystack ? "both options" : "only one option"} at checkout.</div>
        </div>
      </div>

      {/* Toggle cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 28 }}>
        <ToggleCard id="bankTransfer" label="Bank Transfer" icon="🏦" color={BRAND.blue} bg={BRAND.lightBlue} desc="Manual transfer — member sends proof" enabled={pm.bankTransfer} />
        <ToggleCard id="paystack" label="Online — Paystack" icon="💳" color="#00C3F7" bg="#E0F7FF" desc="Card, USSD, instant bank transfer" enabled={pm.paystack} />
      </div>

      {/* Bank details form */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🏦</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Bank Transfer Details</span>
          {!pm.bankTransfer && <span style={{ fontSize: 11, background: "#F3F4F6", color: "#9CA3AF", padding: "2px 8px", borderRadius: 8, fontWeight: 700 }}>DISABLED</span>}
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: "#6B7280" }}>These details are shown to members when they select Bank Transfer at checkout.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Bank Name</label>
            <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Guaranty Trust Bank (GTB)" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Account Number</label>
            <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="0123456789" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Account Name</label>
            <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Hub43 Workspace Ltd" style={inputStyle} />
          </div>
        </div>

        {/* Live preview */}
        <div style={{ background: "#F9FAFB", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Preview — what members see</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["Bank", bankName], ["Account Number", accountNumber], ["Account Name", accountName]].map(([k, v]) => (
              <div key={k} style={{ gridColumn: k === "Account Name" ? "1/-1" : undefined }}>
                <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: v ? "#111" : "#D1D5DB" }}>{v || "—"}</div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={saveBankDetails} disabled={!bankName.trim() || !accountNumber.trim() || !accountName.trim()}
          style={{ padding: "10px 24px", background: !bankName.trim() || !accountNumber.trim() || !accountName.trim() ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Save Bank Details
        </button>
      </div>

      {/* Paystack key */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24, marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>💳</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Paystack Public Key</span>
          {!pm.paystack && <span style={{ fontSize: 11, background: "#F3F4F6", color: "#9CA3AF", padding: "2px 8px", borderRadius: 8, fontWeight: 700 }}>DISABLED</span>}
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6B7280" }}>Enter your Paystack public key. Use <strong>pk_test_…</strong> for testing or <strong>pk_live_…</strong> for production. Found in your <a href="https://dashboard.paystack.com/#/settings/developer" target="_blank" rel="noreferrer" style={{ color: BRAND.blue }}>Paystack dashboard → Settings → API Keys</a>.</p>
        <input
          value={paystackKey}
          onChange={e => setPaystackKey(e.target.value)}
          placeholder="pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, marginBottom: 16 }}
        />
        {paystackKey && (
          <div style={{ background: paystackKey.startsWith("pk_test") ? "#FFFBEB" : paystackKey.startsWith("pk_live") ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, fontWeight: 600, color: paystackKey.startsWith("pk_test") ? "#92400E" : paystackKey.startsWith("pk_live") ? "#16A34A" : "#DC2626" }}>
            {paystackKey.startsWith("pk_test") ? "⚠️ Test mode — no real charges" : paystackKey.startsWith("pk_live") ? "✅ Live mode — real charges apply" : "❌ Invalid key format — must start with pk_test_ or pk_live_"}
          </div>
        )}
        <button onClick={saveBankDetails} disabled={!bankName.trim() || !accountNumber.trim() || !accountName.trim()}
          style={{ padding: "10px 24px", background: !bankName.trim() || !accountNumber.trim() || !accountName.trim() ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Save All Payment Settings
        </button>
      </div>
    </div>
  );
};

// ─── EXPENSES VIEW ───────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = ["Utilities", "Cleaning", "Maintenance", "Stationery", "Refreshments", "Security", "Fuel", "Internet", "Repairs", "Transport", "Miscellaneous"];
const PAYMENT_METHODS = ["cash", "card"];

// ── Excel download helper — produces real .xlsx matching the sample cashbook template
const downloadExpensesExcel = async (expenses, users, filterLabel, fromDate, toDate) => {
  // Load JSZip (reliable CDN) to assemble the .xlsx zip package
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const rows = expenses
    .filter(e => e.date >= fromDate && e.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.enteredAt.localeCompare(b.enteredAt));

  const fmtDate = (d) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
  };

  const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  // Shared strings table
  const strings = [];
  const ssi = (v) => { const s = String(v); const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1; };

  // Pre-register all strings
  const titleStr   = ssi(`OFFICE WEEKLY CASHBOOK(${filterLabel})`);
  const subtitleStr= ssi("CREDIT(PAYABLES)");
  const dateHdr    = ssi("DATE");
  const descHdr    = ssi("DESCRIPTION");
  const cashHdr    = ssi("CASH");
  const cardHdr    = ssi("CREDIT CARD");
  const totalLabel = ssi("Total  Expenses");
  rows.forEach(r => { ssi(fmtDate(r.date)); ssi(r.description); });

  // Style indices (defined in styles.xml below)
  // 0 = default, 1 = title (bold, center, sz11), 2 = subtitle (bold, center, sz11)
  // 3 = header (bold, center, sz11), 4 = data (sz11), 5 = total-label (bold, sz11), 6 = total-num (bold, sz11)

  const dataStartRow = 5;
  const dataEndRow   = dataStartRow + rows.length - 1;
  const totalRow     = rows.length > 0 ? dataEndRow + 1 : dataStartRow;

  // Build sheet rows XML
  let sheetRows = "";

  // Row 2: title
  sheetRows += `<row r="2"><c r="C2" t="s" s="1"><v>${titleStr}</v></c></row>`;
  // Row 3: subtitle
  sheetRows += `<row r="3"><c r="C3" t="s" s="2"><v>${subtitleStr}</v></c></row>`;
  // Row 4: headers
  sheetRows += `<row r="4"><c r="C4" t="s" s="3"><v>${dateHdr}</v></c><c r="D4" t="s" s="3"><v>${descHdr}</v></c><c r="E4" t="s" s="3"><v>${cashHdr}</v></c><c r="F4" t="s" s="3"><v>${cardHdr}</v></c></row>`;

  // Data rows
  rows.forEach((exp, i) => {
    const r = dataStartRow + i;
    const pay = (exp.paymentMethod || "cash").toLowerCase();
    const cashAmt = pay === "cash" ? exp.amount : "";
    const cardAmt = pay !== "cash" ? exp.amount : "";
    const dateIdx = strings.indexOf(fmtDate(exp.date));
    const descIdx = strings.indexOf(exp.description);
    let row = `<row r="${r}">`;
    row += `<c r="C${r}" t="s" s="4"><v>${dateIdx}</v></c>`;
    row += `<c r="D${r}" t="s" s="4"><v>${descIdx}</v></c>`;
    if (cashAmt !== "") row += `<c r="E${r}" s="4"><v>${cashAmt}</v></c>`;
    if (cardAmt !== "") row += `<c r="F${r}" s="4"><v>${cardAmt}</v></c>`;
    row += `</row>`;
    sheetRows += row;
  });

  // Total row with SUM formulas
  const sumE = rows.length > 0 ? `SUM(E${dataStartRow}:E${dataEndRow})` : "0";
  const sumF = rows.length > 0 ? `SUM(F${dataStartRow}:F${dataEndRow})` : "0";
  sheetRows += `<row r="${totalRow}"><c r="D${totalRow}" t="s" s="5"><v>${totalLabel}</v></c><c r="E${totalRow}" s="6"><f>${sumE}</f><v>0</v></c><c r="F${totalRow}" s="6"><f>${sumF}</f><v>0</v></c></row>`;

  const merges = `<mergeCells count="2"><mergeCell ref="C2:F2"/><mergeCell ref="C3:F3"/></mergeCells>`;
  const colWidths = `<cols><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="4" width="45" customWidth="1"/><col min="5" max="5" width="14" customWidth="1"/><col min="6" max="6" width="18" customWidth="1"/></cols>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${colWidths}
<sheetData>${sheetRows}</sheetData>
${merges}
</worksheet>`;

  // Shared strings XML
  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}
</sst>`;

  // Styles XML — font sz11, bold variants, center alignment
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><name val="Arial"/></font>
  </fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="WEEKLY CASHBOOK" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const zip = new window.JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", relsXml);
  zip.file("xl/workbook.xml", workbookXml);
  zip.file("xl/_rels/workbook.xml.rels", workbookRels);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  zip.file("xl/sharedStrings.xml", ssXml);
  zip.file("xl/styles.xml", stylesXml);

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Hub43_Cashbook_${fromDate}_to_${toDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const ExpensesView = ({ data, setData, user }) => {
  const isAdmin = user.role === "admin";
  const isFrontDesk = user.role === "frontdesk";
  const canEdit = isAdmin || isFrontDesk;
  const today = new Date().toISOString().split("T")[0];

  // ── Date filter
  const [filterMode, setFilterMode] = useState("monthly");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  // ── Add/Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = new, string = editing existing
  const [formDate, setFormDate] = useState(today);
  const [formCategory, setFormCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [formDesc, setFormDesc] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPayment, setFormPayment] = useState("card");
  const [formSaved, setFormSaved] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Manager-email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [managerEmail, setManagerEmail] = useState(data.managerEmail || "manager@hub43.com");
  const [emailSent, setEmailSent] = useState(false);

  // ── Weekly report modal
  const [showReport, setShowReport] = useState(false);

  // ── Date range helpers
  const getDateRange = () => {
    const d = new Date();
    const todayStr = d.toISOString().split("T")[0];
    const yest = new Date(d); yest.setDate(d.getDate() - 1);
    const yesterdayStr = yest.toISOString().split("T")[0];

    // This week Mon–Sat
    const dow = d.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const thisMon = new Date(d); thisMon.setDate(d.getDate() + mondayOffset);
    const thisSat = new Date(thisMon); thisSat.setDate(thisMon.getDate() + 5);

    // Last week Mon–Sat
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSat = new Date(lastMon); lastSat.setDate(lastMon.getDate() + 5);

    const monthStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;

    if (filterMode === "today") return { from: todayStr, to: todayStr, label: "Today" };
    if (filterMode === "yesterday") return { from: yesterdayStr, to: yesterdayStr, label: "Yesterday" };
    if (filterMode === "this_week") return {
      from: thisMon.toISOString().split("T")[0],
      to: thisSat.toISOString().split("T")[0],
      label: `This Week (${formatDate(thisMon.toISOString().split("T")[0])} – ${formatDate(thisSat.toISOString().split("T")[0])})`
    };
    if (filterMode === "last_week") return {
      from: lastMon.toISOString().split("T")[0],
      to: lastSat.toISOString().split("T")[0],
      label: `Last Week (${formatDate(lastMon.toISOString().split("T")[0])} – ${formatDate(lastSat.toISOString().split("T")[0])})`
    };
    if (filterMode === "monthly") return { from: monthStart, to: todayStr, label: `This Month (${new Date(monthStart).toLocaleDateString("en-NG", { month: "long", year: "numeric" })})` };
    if (filterMode === "custom") return { from: customFrom, to: customTo, label: `${formatDate(customFrom)} – ${formatDate(customTo)}` };
    return { from: todayStr, to: todayStr, label: "Today" };
  };

  const range = getDateRange();
  const filtered = (data.expenses || [])
    .filter(e => e.date >= range.from && e.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.enteredAt.localeCompare(b.enteredAt));

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);
  const totalCash = filtered.filter(e => (e.paymentMethod || "cash") === "cash").reduce((s, e) => s + e.amount, 0);
  const totalCard = filtered.filter(e => (e.paymentMethod || "cash") !== "cash").reduce((s, e) => s + e.amount, 0);

  // ── Category summary
  const catSummary = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: filtered.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
    count: filtered.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0).sort((a, b) => b.total - a.total);

  // ── Weekly report (current week Mon–Sat)
  const getWeeklyReport = () => {
    const d = new Date();
    const dow = d.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d); mon.setDate(d.getDate() + mondayOffset);
    const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
    const monStr = mon.toISOString().split("T")[0];
    const satStr = sat.toISOString().split("T")[0];
    const weekExpenses = (data.expenses || []).filter(e => e.date >= monStr && e.date <= satStr);
    const days = [];
    for (let i = 0; i < 6; i++) {
      const dd = new Date(mon); dd.setDate(mon.getDate() + i);
      const ds = dd.toISOString().split("T")[0];
      const dayExps = weekExpenses.filter(e => e.date === ds).sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
      days.push({ date: ds, label: dd.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "short" }), expenses: dayExps, total: dayExps.reduce((s, e) => s + e.amount, 0) });
    }
    return { mon: monStr, sat: satStr, days, total: weekExpenses.reduce((s, e) => s + e.amount, 0), weekExpenses };
  };
  const weeklyReport = getWeeklyReport();

  // ── Open form for new entry
  const openNew = () => {
    setEditingId(null);
    setFormDate(today); setFormCategory(EXPENSE_CATEGORIES[0]);
    setFormDesc(""); setFormAmount(""); setFormPayment("cash");
    setFormError(""); setShowForm(true);
  };

  // ── Open form for editing existing entry
  const openEdit = (exp) => {
    setEditingId(exp.id);
    setFormDate(exp.date);
    setFormCategory(exp.category);
    setFormDesc(exp.description);
    setFormAmount(String(exp.amount));
    setFormPayment(exp.paymentMethod || "cash");
    setFormError(""); setShowForm(true);
  };

  // ── Save (new or edit)
  const handleSave = () => {
    if (!formDesc.trim()) { setFormError("Description is required."); return; }
    if (!formAmount || isNaN(Number(formAmount)) || Number(formAmount) <= 0) { setFormError("Enter a valid amount."); return; }
    setFormError("");
    if (editingId) {
      setData(d => ({
        ...d,
        expenses: d.expenses.map(e => e.id === editingId
          ? { ...e, date: formDate, category: formCategory, description: formDesc.trim(), amount: Number(formAmount), paymentMethod: formPayment }
          : e)
      }));
    } else {
      const newExp = {
        id: "exp" + Date.now(),
        date: formDate, category: formCategory,
        description: formDesc.trim(), amount: Number(formAmount),
        paymentMethod: formPayment, recordedBy: user.id,
        enteredAt: new Date().toISOString(),
      };
      setData(d => ({ ...d, expenses: [...(d.expenses || []), newExp] }));
    }
    setFormSaved(true);
    setFormDesc(""); setFormAmount(""); setFormDate(today);
    setTimeout(() => { setFormSaved(false); setShowForm(false); setEditingId(null); }, 1600);
  };

  // ── Delete (admin only)
  const handleDelete = (id) => {
    if (!window.confirm("Delete this expense entry?")) return;
    setData(d => ({ ...d, expenses: d.expenses.filter(e => e.id !== id) }));
  };

  // ── Send weekly report email via ZeptoMail
  const [emailError, setEmailError] = useState("");
  const handleSendReport = async () => {
    setEmailError("");
    setData(d => ({ ...d, managerEmail }));

    // Build a plain-text report body
    const reportLines = weeklyReport.days
      .filter(day => day.expenses.length > 0)
      .map(day => {
        const header = `${day.label}  —  ${formatNGN(day.total)}`;
        const rows = day.expenses.map(e => `  • [${e.category}] ${e.description}: ${formatNGN(e.amount)}`).join("\n");
        return `${header}\n${rows}`;
      }).join("\n\n");

    const weekLabel = `${formatDate(weeklyReport.mon)} – ${formatDate(weeklyReport.sat)}`;
    const emailBody = `Weekly Expense Report — Hub43 Workspace
Period: ${weekLabel}
Total Expenses: ${formatNGN(weeklyReport.total)}
Total Entries: ${weeklyReport.weekExpenses.length}

────────────────────────────────
${reportLines || "No expenses recorded this week."}
────────────────────────────────

Sent by Hub43 Workspace Management System`;

    const es = data.emailSettings || {};
    const params = buildEmailParams.weeklyExpenseReport({
      managerEmail, weekLabel, total: weeklyReport.total,
      entries: weeklyReport.weekExpenses.length, reportBody: emailBody,
    });

    const result = await sendZeptoMail({ templateParams: params });
    const logEntry = { id: "el" + Date.now(), type: "expense_report", to: managerEmail, subject: params.subject, status: result.ok ? "sent" : "fallback", timestamp: new Date().toISOString() };
    setData(d => ({ ...d, emailSettings: { ...d.emailSettings, emailLog: [...(d.emailSettings?.emailLog || []), logEntry] } }));
    setEmailSent(true);
    setTimeout(() => { setEmailSent(false); setShowEmailModal(false); }, 3000);
  };

  const inputSty = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const filterBtns = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "this_week", label: "This Week" },
    { key: "last_week", label: "Last Week" },
    { key: "monthly", label: "Monthly" },
    { key: "custom", label: "Custom" },
  ];

  const catColors = { Utilities:"#3B82F6", Cleaning:"#10B981", Maintenance:"#F59E0B", Stationery:"#8B5CF6", Refreshments:"#EC4899", Security:"#EF4444", Fuel:"#F97316", Internet:"#06B6D4", Repairs:"#84CC16", Transport:"#6366F1", Miscellaneous:"#6B7280" };

  return (
    <div>
      {/* ── Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Expenses</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>Log and review workspace operating expenses</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => downloadExpensesExcel(data.expenses || [], data.users, range.label, range.from, range.to)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#059669", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon name="download" size={15} color="#fff" /> Download Excel
          </button>
          <button onClick={() => setShowReport(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon name="invoice" size={15} /> Weekly Report
          </button>
          <button onClick={() => setShowEmailModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: BRAND.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon name="send" size={15} color="#fff" /> Send to Manager
          </button>
          {canEdit && (
            <button onClick={openNew}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <Icon name="plus" size={15} color="#fff" /> Add Expense
            </button>
          )}
        </div>
      </div>

      {/* ── Saved banner */}
      {formSaved && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
          <Icon name="check" size={16} color="#16A34A" /> {editingId ? "Expense updated!" : "Expense recorded!"}
        </div>
      )}

      {/* ── Add / Edit Form */}
      {showForm && (
        <div style={{ background: "#fff", border: `2px solid ${editingId ? BRAND.orange : BRAND.blue}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: editingId ? BRAND.orange : BRAND.blue }}>
              {editingId ? "✏️ Edit Expense Entry" : "➕ New Expense Entry"}
            </h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
              <Icon name="x" size={18} />
            </button>
          </div>
          {formError && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#DC2626", marginBottom: 12 }}>{formError}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Date</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={inputSty} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Category</label>
              <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={inputSty}>
                {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Amount (₦)</label>
              <input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="e.g. 15000" style={inputSty} min="0" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Payment Method</label>
              <div style={{ display: "flex", gap: 8 }}>
                {PAYMENT_METHODS.map(pm => (
                  <button key={pm} onClick={() => setFormPayment(pm)} style={{ flex: 1, padding: "10px 0", border: `2px solid ${formPayment === pm ? BRAND.blue : "#E5E7EB"}`, borderRadius: 8, background: formPayment === pm ? BRAND.lightBlue : "#fff", color: formPayment === pm ? BRAND.blue : "#374151", fontSize: 13, fontWeight: formPayment === pm ? 700 : 400, cursor: "pointer", textTransform: "capitalize" }}>
                    {pm === "cash" ? "💵 Cash" : "💳 Card"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Description</label>
            <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description of the expense..." style={inputSty} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} style={{ padding: "10px 18px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={!formDesc.trim() || !formAmount || Number(formAmount) <= 0}
              style={{ padding: "10px 24px", background: !formDesc.trim() || !formAmount || Number(formAmount) <= 0 ? "#9CA3AF" : (editingId ? BRAND.orange : "#059669"), color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="check" size={14} color="#fff" /> {editingId ? "Update Entry" : "Save Expense"}
            </button>
          </div>
        </div>
      )}

      {/* ── Filter Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {filterBtns.map(fb => (
          <button key={fb.key} onClick={() => setFilterMode(fb.key)}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid", borderColor: filterMode === fb.key ? BRAND.blue : "#E5E7EB", background: filterMode === fb.key ? BRAND.blue : "#fff", color: filterMode === fb.key ? "#fff" : "#374151", fontSize: 13, fontWeight: filterMode === fb.key ? 700 : 400, cursor: "pointer" }}>
            {fb.label}
          </button>
        ))}
      </div>

      {/* ── Custom date picker */}
      {filterMode === "custom" && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...inputSty, width: 160 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...inputSty, width: 160 }} />
          </div>
        </div>
      )}

      {/* ── Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Total Expenses</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: BRAND.red }}>{formatNGN(totalFiltered)}</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{filtered.length} entries</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>💵 Cash</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{formatNGN(totalCash)}</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{filtered.filter(e=>(e.paymentMethod||"cash")==="cash").length} entries</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>💳 Credit Card</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.blue }}>{formatNGN(totalCard)}</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{filtered.filter(e=>(e.paymentMethod||"cash")!=="cash").length} entries</div>
        </div>
        {catSummary.slice(0, 3).map(c => (
          <div key={c.cat} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{c.cat}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: catColors[c.cat] || BRAND.blue }}>{formatNGN(c.total)}</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{c.count} {c.count === 1 ? "entry" : "entries"}</div>
          </div>
        ))}
      </div>

      {/* ── Expenses Table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Expense Entries — {range.label}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>{filtered.length} records</span>
            <button onClick={() => downloadExpensesExcel(data.expenses || [], data.users, range.label, range.from, range.to)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#059669", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              <Icon name="download" size={13} color="#fff" /> Export Excel
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No expenses for this period</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Expense" to log a new entry.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Date","Category","Description","Cash (₦)","Card (₦)","Total (₦)","By",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: ["Cash (₦)","Card (₦)","Total (₦)"].includes(h) ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((exp, i) => {
                  const recorder = data.users.find(u => u.id === exp.recordedBy);
                  const pay = (exp.paymentMethod || "cash").toLowerCase();
                  const cashAmt = pay === "cash" ? exp.amount : null;
                  const cardAmt = pay !== "cash" ? exp.amount : null;
                  return (
                    <tr key={exp.id} style={{ borderTop: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>{formatDate(exp.date)}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={{ background: (catColors[exp.category] || "#6B7280") + "18", color: catColors[exp.category] || "#6B7280", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{exp.category}</span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 13, color: "#111", maxWidth: 220 }}>{exp.description}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 700, color: "#059669", textAlign: "right", whiteSpace: "nowrap" }}>{cashAmt != null ? formatNGN(cashAmt) : <span style={{ color: "#E5E7EB" }}>—</span>}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 700, color: BRAND.blue, textAlign: "right", whiteSpace: "nowrap" }}>{cardAmt != null ? formatNGN(cardAmt) : <span style={{ color: "#E5E7EB" }}>—</span>}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 900, color: BRAND.red, textAlign: "right", whiteSpace: "nowrap" }}>{formatNGN(exp.amount)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>{recorder?.name?.split(" ")[0] || "—"}</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {canEdit && (
                          <button onClick={() => openEdit(exp)} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: BRAND.blue, padding: "3px 5px", marginRight: 2 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(exp.id)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: "3px 5px" }}>
                            <Icon name="trash" size={14} color="#EF4444" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #1E3A8A", background: "#1E3A8A" }}>
                  <td colSpan={3} style={{ padding: "12px", fontSize: 13, fontWeight: 800, color: "#fff" }}>TOTAL EXPENSES</td>
                  <td style={{ padding: "12px", fontSize: 13, fontWeight: 800, color: "#FDE68A", textAlign: "right" }}>{formatNGN(totalCash)}</td>
                  <td style={{ padding: "12px", fontSize: 13, fontWeight: 800, color: "#FDE68A", textAlign: "right" }}>{formatNGN(totalCard)}</td>
                  <td style={{ padding: "12px", fontSize: 14, fontWeight: 900, color: "#FDE68A", textAlign: "right" }}>{formatNGN(totalFiltered)}</td>
                  <td colSpan={2} style={{ background: "#1E3A8A" }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Weekly Report Modal */}
      <Modal open={showReport} onClose={() => setShowReport(false)} title="Weekly Expense Report (Mon – Sat)" width={660}>
        <div>
          <div style={{ background: BRAND.lightBlue, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>Week: {formatDate(weeklyReport.mon)} — {formatDate(weeklyReport.sat)}</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: BRAND.red }}>{formatNGN(weeklyReport.total)}</span>
          </div>
          {weeklyReport.days.map(day => (
            <div key={day.date} style={{ marginBottom: 10, background: "#F9FAFB", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", background: day.total > 0 ? BRAND.blue : "#E5E7EB" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: day.total > 0 ? "#fff" : "#9CA3AF" }}>{day.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: day.total > 0 ? "#FDE68A" : "#9CA3AF" }}>{day.total > 0 ? formatNGN(day.total) : "No entries"}</span>
              </div>
              {day.expenses.map(exp => {
                const pay = (exp.paymentMethod || "cash").toLowerCase();
                return (
                  <div key={exp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 14px", borderBottom: "1px solid #E5E7EB", fontSize: 12 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ background: (catColors[exp.category]||"#6B7280")+"18", color: catColors[exp.category]||"#6B7280", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, marginRight: 6 }}>{exp.category}</span>
                      <span style={{ color: "#374151" }}>{exp.description}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, background: pay === "cash" ? "#D1FAE5" : "#DBEAFE", color: pay === "cash" ? "#059669" : BRAND.blue, padding: "2px 6px", borderRadius: 8, fontWeight: 700 }}>{pay === "cash" ? "💵 Cash" : "💳 Card"}</span>
                      <span style={{ fontWeight: 700, color: BRAND.red }}>{formatNGN(exp.amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button onClick={() => downloadExpensesExcel(data.expenses || [], data.users, `${formatDate(weeklyReport.mon)} – ${formatDate(weeklyReport.sat)}`, weeklyReport.mon, weeklyReport.sat)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", background: "#059669", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <Icon name="download" size={14} color="#fff" /> Download Excel
            </button>
            <button onClick={() => { setShowReport(false); setShowEmailModal(true); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", background: BRAND.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <Icon name="send" size={14} color="#fff" /> Send to Manager
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Send to Manager Modal */}
      <Modal open={showEmailModal} onClose={() => { setShowEmailModal(false); setEmailSent(false); }} title="Send Weekly Report to Manager" width={480}>
        {emailSent ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 56, height: 56, background: "#F0FDF4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Icon name="check" size={28} color="#16A34A" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#16A34A", marginBottom: 6 }}>Report Sent!</div>
            <div style={{ fontSize: 13, color: "#6B7280" }}>Weekly expense report emailed to <strong>{managerEmail}</strong></div>
          </div>
        ) : (
          <div>
            <div style={{ background: BRAND.lightOrange, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: BRAND.orange }}>
              <strong>📅 Auto-Schedule:</strong> Report sends every <strong>Saturday at 6:00 PM</strong> to manager's email. You can also trigger it manually below.
              <div style={{ marginTop: 8, fontSize: 11, color: "#92400E" }}>
                💡 <strong>Email setup:</strong> To enable real sending, configure your <a href="https://zeptomail.zoho.com" target="_blank" rel="noreferrer" style={{ color: BRAND.blue }}>ZeptoMail</a> credentials (Send Mail Token, From Address) in Admin → Email Settings. Until then, clicking "Send" opens your mail client as a fallback.
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Manager's Email Address</label>
              <input value={managerEmail} onChange={e => setManagerEmail(e.target.value)} type="email" placeholder="manager@hub43.com" style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Report Preview — Current Week</div>
              {[["Period", `${formatDate(weeklyReport.mon)} – ${formatDate(weeklyReport.sat)}`], ["Total Entries", weeklyReport.weekExpenses.length], ["Total Amount", formatNGN(weeklyReport.total)]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", marginBottom: 6 }}>
                  <span>{k}</span><span style={{ fontWeight: 700, color: k === "Total Amount" ? BRAND.red : "#111" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowEmailModal(false)} style={{ padding: "10px 18px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSendReport} disabled={!managerEmail.trim()}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 20px", background: !managerEmail.trim() ? "#9CA3AF" : BRAND.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: managerEmail.trim() ? "pointer" : "not-allowed" }}>
                <Icon name="send" size={14} color="#fff" /> Send Report Now
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── ADMIN: EMAIL SETTINGS ────────────────────────────────────────────────────
const AdminEmailSettings = ({ data, setData }) => {
  const es = data.emailSettings || {};
  const [sendMailToken, setSendMailToken] = useState(es.sendMailToken || "");
  const [fromAddress, setFromAddress]     = useState(es.fromAddress || "");
  const [fromName, setFromName]           = useState(es.fromName || "Hub43 Workspace");
  const [saved, setSaved]                 = useState(false);
  const [testing, setTesting]             = useState(false);
  const [testResult, setTestResult]       = useState(null);
  const [testEmail, setTestEmail]         = useState(data.managerEmail || "");

  const toggles = [
    { key: "enableBookingConfirmation",   label: "Booking Confirmation",   desc: "Email member when they submit a booking" },
    { key: "enableBookingApproval",       label: "Booking Approved",       desc: "Email member + WiFi creds when admin approves" },
    { key: "enableSubscriptionActivated", label: "Subscription Activated", desc: "Email when a new subscription is activated" },
    { key: "enableSubscriptionRenewed",   label: "Subscription Renewed",   desc: "Email when a subscription is renewed" },
    { key: "enableExpiryReminder",        label: "Expiry Reminder",        desc: "Email reminders when subscriptions near expiry" },
    { key: "enableInvoiceEmail",          label: "Invoice Email",          desc: "Email invoice link on payment" },
  ];

  const saveSettings = () => {
    setData(d => ({
      ...d,
      emailSettings: { ...d.emailSettings, sendMailToken: sendMailToken.trim(), fromAddress: fromAddress.trim(), fromName: fromName.trim() || "Hub43 Workspace" },
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleToggle = (key) => {
    setData(d => ({
      ...d,
      emailSettings: { ...d.emailSettings, [key]: !(d.emailSettings?.[key] ?? true) },
    }));
  };

  const sendTest = async () => {
    setTesting(true); setTestResult(null);
    const params = {
      to_email: testEmail,
      to_name: "Hub43 Team",
      subject: "Hub43 – Email Test ✅",
      message: `This is a test email from Hub43 Workspace.\n\nIf you received this, your ZeptoMail integration is working correctly!\n\nFrom Address: ${fromAddress}\nSender Name: ${fromName}\n\nHub43 Workspace Team`,
    };
    const result = await sendZeptoMail({ templateParams: params });
    setTestResult(result.ok ? "success" : result.fallback ? "fallback" : "error");
    setTesting(false);
    if (result.ok || result.fallback) {
      const logEntry = { id: "el" + Date.now(), type: "test", to: testEmail, subject: params.subject, status: result.ok ? "sent" : "fallback_mailto", timestamp: new Date().toISOString() };
      setData(d => ({ ...d, emailSettings: { ...d.emailSettings, emailLog: [...(d.emailSettings?.emailLog || []), logEntry] } }));
    }
  };

  const emailLog = (es.emailLog || []).slice().reverse().slice(0, 20);
  const isConfigured = sendMailToken && fromAddress && sendMailToken !== "YOUR_SEND_MAIL_TOKEN" && sendMailToken.length > 20;
  const inp = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>📧 Email Settings</h2>
      <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 13 }}>ZeptoMail credentials are set as Vercel environment variables (<code>ZEPTO_TOKEN</code>, <code>ZEPTO_FROM_ADDRESS</code>). Use the test button below to verify delivery, and toggle which events trigger emails.</p>

      {/* Status banner */}
      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 20 }}>✅</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>
            Emails sent via Vercel serverless function → ZeptoMail
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
            Credentials live in Vercel env vars — no token entry needed here. See <strong>DEPLOY.md</strong> for setup.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* ── Vercel Env Var Info ── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <Icon name="settings" size={18} color={BRAND.blue} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>ZeptoMail Configuration</span>
          </div>
          <div style={{ background: BRAND.lightBlue, borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontSize: 12, color: BRAND.blue, lineHeight: 1.8 }}>
            <strong>Credentials are managed via Vercel env vars:</strong><br />
            <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>ZEPTO_TOKEN</code> — Send Mail Token<br />
            <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>ZEPTO_FROM_ADDRESS</code> — Verified sender<br />
            <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>ZEPTO_FROM_NAME</code> — Display name
          </div>
          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
            <strong>To update credentials:</strong><br />
            1. Go to <strong>Vercel Dashboard → Project → Settings → Environment Variables</strong><br />
            2. Update the value and redeploy (<code>vercel --prod</code>)<br />
            3. Credentials are never stored in the app or browser
          </div>
        </div>

        {/* ── Test Email ── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <Icon name="send" size={18} color={BRAND.orange} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Send Test Email</span>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Send test to</label>
            <input value={testEmail} onChange={e => setTestEmail(e.target.value)} type="email" placeholder="your@email.com" style={inp} />
          </div>
          {testResult && (
            <div style={{ background: testResult === "success" ? "#F0FDF4" : testResult === "fallback" ? "#FFFBEB" : "#FEF2F2", border: `1px solid ${testResult === "success" ? "#BBF7D0" : testResult === "fallback" ? "#FDE68A" : "#FECACA"}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600, color: testResult === "success" ? "#16A34A" : testResult === "fallback" ? "#92400E" : "#DC2626", marginBottom: 14 }}>
              {testResult === "success" ? "✅ Test email sent successfully!" : testResult === "fallback" ? "📬 Credentials not set — opened mailto fallback" : "❌ Email failed. Check your token and from address."}
            </div>
          )}
          <button onClick={sendTest} disabled={testing || !testEmail.trim()} style={{ width: "100%", padding: "11px", background: testing || !testEmail.trim() ? "#9CA3AF" : BRAND.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: testing || !testEmail.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="send" size={16} color="#fff" />
            {testing ? "Sending…" : "Send Test Email"}
          </button>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Email relay endpoint</div>
            <div style={{ display: "inline-block", background: BRAND.lightBlue, color: BRAND.blue, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, fontFamily: "monospace" }}>POST /api/send-email → ZeptoMail</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>Your Vercel serverless function handles the ZeptoMail API call server-side — no CORS issues, token stays secure.</div>
          </div>
        </div>
      </div>

      {/* ── Email Toggle Controls ── */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Icon name="bell" size={18} color={BRAND.blue} />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Email Notifications</span>
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>— toggle which events trigger emails</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {toggles.map(({ key, label, desc }) => {
            const enabled = es[key] !== false;
            return (
              <div key={key} onClick={() => handleToggle(key)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, border: `2px solid ${enabled ? BRAND.blue + "44" : "#E5E7EB"}`, background: enabled ? BRAND.lightBlue : "#F9FAFB", cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 40, height: 22, borderRadius: 11, background: enabled ? BRAND.blue : "#D1D5DB", position: "relative", transition: "background .2s", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: enabled ? 20 : 2, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: enabled ? BRAND.blue : "#6B7280" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Email Log ── */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="mail" size={18} color={BRAND.blue} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Email Log</span>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>— last 20 emails</span>
          </div>
          {emailLog.length > 0 && (
            <button onClick={() => setData(d => ({ ...d, emailSettings: { ...d.emailSettings, emailLog: [] } }))}
              style={{ padding: "5px 12px", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              Clear Log
            </button>
          )}
        </div>
        {emailLog.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#9CA3AF", fontSize: 13, background: "#F9FAFB", borderRadius: 10, border: "2px dashed #E5E7EB" }}>
            No emails sent yet. Configure ZeptoMail and trigger a booking or subscription to see logs here.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#F9FAFB" }}>
                {["Time", "Type", "To", "Subject", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {emailLog.map(entry => (
                  <tr key={entry.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>{new Date(entry.timestamp).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: BRAND.lightBlue, color: BRAND.blue, padding: "2px 8px", borderRadius: 10, textTransform: "capitalize" }}>
                        {entry.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#374151" }}>{entry.to}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#374151" }}>{entry.subject}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                        background: entry.status === "sent" ? "#DCFCE7" : entry.status?.includes("fallback") ? "#FEF9C3" : "#FEE2E2",
                        color: entry.status === "sent" ? "#16A34A" : entry.status?.includes("fallback") ? "#92400E" : "#DC2626" }}>
                        {entry.status === "sent" ? "✓ Sent" : entry.status?.includes("fallback") ? "Mailto fallback" : entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── MEMBER PROFILE ──────────────────────────────────────────────────────────
const MemberProfile = ({ user, data, setData, setUser }) => {
  const [nameVal, setNameVal] = useState(user.name);
  const [phoneVal, setPhoneVal] = useState(user.phone || "");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});

  const [passForm, setPassForm] = useState({ current: "", newPass: "", confirm: "" });
  const [passErrors, setPassErrors] = useState({});
  const [passSaved, setPassSaved] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 };
  const errStyle = { fontSize: 11, color: BRAND.red, marginTop: 4 };

  const handleSaveProfile = () => {
    const e = {};
    if (!nameVal.trim()) e.name = "Name is required";
    setProfileErrors(e);
    if (Object.keys(e).length > 0) return;
    setData(d => ({
      ...d,
      users: d.users.map(u => u.id === user.id ? { ...u, name: nameVal.trim(), phone: phoneVal.trim() || "—" } : u),
    }));
    // Update the live session user object so TopNav reflects the change immediately
    setUser(u => ({ ...u, name: nameVal.trim(), phone: phoneVal.trim() || "—" }));
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3500);
  };

  const handleChangePassword = () => {
    const e = {};
    const passwords = data.userPasswords || {};
    const stored = passwords[user.id] || "member123";
    if (!passForm.current) e.current = "Current password is required";
    else if (passForm.current !== stored) e.current = "Current password is incorrect";
    if (!passForm.newPass || passForm.newPass.length < 6) e.newPass = "New password must be at least 6 characters";
    if (passForm.newPass === passForm.current) e.newPass = "New password must be different from current";
    if (passForm.newPass !== passForm.confirm) e.confirm = "Passwords do not match";
    setPassErrors(e);
    if (Object.keys(e).length > 0) return;
    setData(d => ({
      ...d,
      userPasswords: { ...(d.userPasswords || {}), [user.id]: passForm.newPass },
    }));
    setPassForm({ current: "", newPass: "", confirm: "" });
    setPassErrors({});
    setPassSaved(true);
    setTimeout(() => setPassSaved(false), 3500);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>My Profile</h2>
        <p style={{ margin: 0, color: "#6B7280", fontSize: 13 }}>Update your name, phone number, and password.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 800 }}>
        {/* ── Personal Info ── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: BRAND.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: BRAND.orange }}>{nameVal[0] || "?"}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{nameVal}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{user.email}</div>
              <span style={{ fontSize: 10, fontWeight: 700, background: BRAND.lightOrange, color: BRAND.orange, padding: "2px 8px", borderRadius: 10, marginTop: 4, display: "inline-block" }}>Member</span>
            </div>
          </div>

          {profileSaved && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
              <Icon name="check" size={14} color="#16A34A" /> Profile updated successfully!
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Full Name <span style={{ color: BRAND.red }}>*</span></label>
            <input value={nameVal} onChange={e => setNameVal(e.target.value)}
              placeholder="Your full name"
              style={{ ...inputStyle, borderColor: profileErrors.name ? BRAND.red : "#E5E7EB" }} />
            {profileErrors.name && <div style={errStyle}>{profileErrors.name}</div>}
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Email Address</label>
            <div style={{ padding: "10px 14px", background: "#F9FAFB", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, color: "#9CA3AF" }}>{user.email}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Email address cannot be changed. Contact admin if needed.</div>
          </div>

          <div style={{ marginBottom: 20, marginTop: 14 }}>
            <label style={labelStyle}>Phone Number</label>
            <input value={phoneVal} onChange={e => setPhoneVal(e.target.value)}
              placeholder="+234-800-000-0000"
              style={inputStyle} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #F3F4F6", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>Member Since</span>
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{formatDate(user.joined)}</span>
          </div>

          <button onClick={handleSaveProfile}
            style={{ width: "100%", padding: "11px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Save Changes
          </button>
        </div>

        {/* ── Change Password ── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Change Password</span>
          </div>

          {passSaved && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
              <Icon name="check" size={14} color="#16A34A" /> Password changed successfully!
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Current Password <span style={{ color: BRAND.red }}>*</span></label>
            <div style={{ position: "relative" }}>
              <input value={passForm.current} onChange={e => setPassForm(f => ({ ...f, current: e.target.value }))}
                type={showCurrent ? "text" : "password"} placeholder="Enter current password"
                style={{ ...inputStyle, paddingRight: 60, borderColor: passErrors.current ? BRAND.red : "#E5E7EB" }} />
              <button onClick={() => setShowCurrent(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
            {passErrors.current && <div style={errStyle}>{passErrors.current}</div>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New Password <span style={{ color: BRAND.red }}>*</span></label>
            <div style={{ position: "relative" }}>
              <input value={passForm.newPass} onChange={e => setPassForm(f => ({ ...f, newPass: e.target.value }))}
                type={showNew ? "text" : "password"} placeholder="Min. 6 characters"
                style={{ ...inputStyle, paddingRight: 60, borderColor: passErrors.newPass ? BRAND.red : "#E5E7EB" }} />
              <button onClick={() => setShowNew(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            {passErrors.newPass && <div style={errStyle}>{passErrors.newPass}</div>}
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Confirm New Password <span style={{ color: BRAND.red }}>*</span></label>
            <input value={passForm.confirm} onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))}
              type={showNew ? "text" : "password"} placeholder="Re-enter new password"
              style={{ ...inputStyle, borderColor: passErrors.confirm ? BRAND.red : "#E5E7EB" }} />
            {passErrors.confirm && <div style={errStyle}>{passErrors.confirm}</div>}
          </div>

          <button onClick={handleChangePassword}
            style={{ width: "100%", padding: "11px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Update Password
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── ADD SERVICE VIEW (member upsell) ────────────────────────────────────────
const AddServiceView = ({ user, data, setData, setActive }) => {
  const activeSubs = (data.subscriptions || []).filter(s => s.userId === user.id && s.status === "active");
  const subscribedIds = activeSubs.map(s => s.service);
  const hasComplimentaryVO = !subscribedIds.includes("virtual_office") && activeSubs.some(s =>
    (s.service === "private_office" || s.service === "hot_desk") &&
    ["monthly", "quarterly", "yearly"].includes(s.plan)
  );
  const availableServices = ONBOARDING_SERVICES.filter(s =>
    !subscribedIds.includes(s.id) && !(s.id === "virtual_office" && hasComplimentaryVO)
  );

  const [selectedService, setSelectedService] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [payMethod, setPayMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [psOpening, setPsOpening] = useState(false);
  const [done, setDone] = useState(false);
  const [addedService, setAddedService] = useState(null);
  const [lastPayMethod, setLastPayMethod] = useState(null);

  const svc = ONBOARDING_SERVICES.find(s => s.id === selectedService);
  const plan = svc?.plans.find(p => p.id === selectedPlan);

  const handleAdd = () => {
    if (!selectedService || !selectedPlan || !payMethod) return;
    const isBankTransfer = payMethod === "bank";

    const commitAdd = () => {
      const today = new Date().toISOString().split("T")[0];
      const endDate = plan.days > 0
        ? (() => { const d = new Date(); d.setDate(d.getDate() + plan.days); return d.toISOString().split("T")[0]; })()
        : today;
      const newSub = { id: "s" + Date.now(), userId: user.id, service: svc.id, plan: plan.id, startDate: today, endDate, status: isBankTransfer ? "pending_transfer" : "active", amount: plan.price, paymentMethod: payMethod, paymentConfirmed: !isBankTransfer };
      const newInv = { id: "inv" + Date.now(), userId: user.id, amount: plan.price, date: today, status: isBankTransfer ? "unpaid" : "paid", service: svc.label, description: `${svc.label} — ${plan.label} plan` };
      setData(d => ({ ...d, subscriptions: [...d.subscriptions, newSub], invoices: [...d.invoices, newInv] }));
      setAddedService(svc.label);
      setLastPayMethod(payMethod);
      setLoading(false);
      setDone(true);
    };

    if (!isBankTransfer) {
      const key = data.paymentMethods?.paystackKey;
      if (!key || !key.startsWith("pk_")) { alert("Paystack key not configured. Please contact the admin."); return; }
      openPaystackCheckout({
        key, email: user.email, amount: plan.price, name: user.name,
        onOpen: () => setPsOpening(true),
        onSuccess: () => { setPsOpening(false); setLoading(true); commitAdd(); },
        onClose: () => setPsOpening(false),
      });
    } else {
      setLoading(true);
      setTimeout(commitAdd, 1400);
    }
  };

  if (done) {
    const isBankDone = lastPayMethod === "bank";
    const bd = data.paymentMethods?.bankDetails || {};
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
        <div style={{ width: 72, height: 72, background: isBankDone ? "#FFF4EA" : "#DCFCE7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <span style={{ fontSize: 36 }}>{isBankDone ? "⏳" : "✓"}</span>
        </div>
        <h2 style={{ color: BRAND.blue, marginBottom: 8 }}>{isBankDone ? `${addedService} — Awaiting Payment` : `${addedService} Added!`}</h2>
        <p style={{ color: "#6B7280", marginBottom: isBankDone ? 20 : 24 }}>{isBankDone ? "Transfer the amount below to complete your subscription. Admin will activate it once payment is confirmed." : "Your new service is now active and visible in the sidebar."}</p>
        {isBankDone && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16, marginBottom: 24, textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange, marginBottom: 10 }}>Bank Transfer Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.bankName || "—"}</div></div>
              <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div><div style={{ fontSize: 13, fontWeight: 800, color: "#111", letterSpacing: "0.08em" }}>{bd.accountNumber || "—"}</div></div>
              <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div><div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{bd.accountName || "—"}</div></div>
            </div>
            <div style={{ background: BRAND.lightOrange, borderRadius: 6, padding: "7px 10px", fontSize: 11, color: BRAND.orange }}>
              Use your <strong>name + invoice amount</strong> as reference. Send proof to the front desk.
            </div>
          </div>
        )}
        <button onClick={() => setActive("dashboard")} style={{ padding: "12px 28px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Go to Dashboard</button>
      </div>
    );
  }

  if (availableServices.length === 0) return (
    <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
      <h2 style={{ color: BRAND.blue, marginBottom: 8 }}>You're fully subscribed!</h2>
      <p style={{ color: "#6B7280", marginBottom: 24 }}>You have active subscriptions for all Hub43 services.</p>
      <button onClick={() => setActive("subscriptions")} style={{ padding: "12px 28px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Manage Subscriptions</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Add a Service</h2>
        <p style={{ margin: 0, color: "#6B7280", fontSize: 13 }}>Expand your Hub43 access with additional services.</p>
      </div>

      {/* Service picker */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        {availableServices.map(s => (
          <div key={s.id} onClick={() => { setSelectedService(s.id); setSelectedPlan(s.plans[0].id); setPayMethod(null); }}
            style={{ border: `2px solid ${selectedService === s.id ? s.color : "#E5E7EB"}`, borderRadius: 14, padding: 18, cursor: "pointer", background: selectedService === s.id ? s.color + "08" : "#fff", transition: "all .2s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, background: s.color + "18", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={s.icon} size={18} color={s.color} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: selectedService === s.id ? s.color : "#111" }}>{s.label}</div>
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>{s.desc}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>from {formatNGN(s.plans[0].price)}<span style={{ fontSize: 11, fontWeight: 400, color: "#9CA3AF" }}>{s.plans[0].suffix}</span></div>
          </div>
        ))}
      </div>

      {/* Plan + payment */}
      {svc && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.blue, marginBottom: 14 }}>Choose Plan — {svc.label}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {svc.plans.map(p => (
              <button key={p.id} onClick={() => setSelectedPlan(p.id)}
                style={{ padding: "8px 14px", borderRadius: 8, border: `2px solid ${selectedPlan === p.id ? svc.color : "#E5E7EB"}`, background: selectedPlan === p.id ? svc.color : "#F9FAFB", color: selectedPlan === p.id ? "#fff" : "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {p.label} — {formatNGN(p.price)}{p.suffix}
              </button>
            ))}
          </div>
          <PaymentSelector paymentMethods={data.paymentMethods} amount={plan?.price || 0} selected={payMethod} onChange={setPayMethod} paying={loading || psOpening} />
          <button onClick={handleAdd} disabled={!selectedPlan || !payMethod || loading || psOpening}
            style={{ width: "100%", padding: "12px", background: !selectedPlan || !payMethod || loading || psOpening ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: !selectedPlan || !payMethod || loading || psOpening ? "not-allowed" : "pointer" }}>
            {loading ? "Saving..." : psOpening ? "Opening Paystack..." : `Confirm — ${plan ? formatNGN(plan.price) : ""}`}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── LOCALSTORAGE HELPERS ─────────────────────────────────────────────────────
const LS_KEY = "hub43_data_v2";

// ─── SESSION MANAGEMENT ───────────────────────────────────────────────────────
const SESSION_KEY = "hub43_session_v1";
// How long a session lasts from login (ms)
const SESSION_DURATION_MS = {
  admin:     8  * 60 * 60 * 1000, // 8 hours
  frontdesk: 8  * 60 * 60 * 1000, // 8 hours
  member:    24 * 60 * 60 * 1000, // 24 hours
};
// Inactivity window — reset expiry on interaction if more than this has passed (ms)
const ACTIVITY_DEBOUNCE_MS = 30 * 60 * 1000; // 30 minutes
// Show "session expiring soon" banner this many ms before expiry
const SESSION_WARN_BEFORE_MS = 5 * 60 * 1000; // 5 minutes

const writeSession = (user) => {
  try {
    const duration = SESSION_DURATION_MS[user.role] ?? SESSION_DURATION_MS.member;
    const now = Date.now();
    const session = { userId: user.id, role: user.role, loginAt: now, expiresAt: now + duration };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch { return null; }
};

const readSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.userId || !s?.expiresAt) return null;
    if (Date.now() > s.expiresAt) { clearSession(); return null; }
    return s;
  } catch { return null; }
};

const clearSession = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
};

const extendSession = (role) => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s?.expiresAt) return;
    const duration = SESSION_DURATION_MS[role] ?? SESSION_DURATION_MS.member;
    s.expiresAt = Date.now() + duration;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
};
// ─── ADMIN: PENDING PAYMENTS ─────────────────────────────────────────────────
const AdminPendingPayments = ({ data, setData }) => {
  const [confirming, setConfirming] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  // Subscriptions awaiting bank transfer confirmation
  const pendingSubs = data.subscriptions.filter(s => s.status === "pending_transfer");
  // Also surface bookings paid by bank_transfer that are still "pending"
  const pendingBookings = data.bookings.filter(b =>
    b.paymentMethod === "bank" && b.status === "pending"
  );

  const confirmSubPayment = (subId) => {
    setConfirming(subId);
    setTimeout(() => {
      setData(d => {
        const sub = d.subscriptions.find(s => s.id === subId);
        const member = sub ? d.users.find(u => u.id === sub.userId) : null;
        const es = d.emailSettings || {};
        const notif = sub ? {
          id: "n" + Date.now(), userId: sub.userId, type: "info",
          message: `✅ Your Bank Transfer payment for ${sub.service.replace(/_/g," ")} (${sub.plan}) has been confirmed. Your subscription is now active!`,
          read: false, date: new Date().toISOString().split("T")[0],
        } : null;
        let emailLogEntry = null;
        if (member && sub && es.enableSubscriptionActivated !== false) {
          const params = buildEmailParams.subscriptionActivated({ user: member, sub: { ...sub, status: "active" } });
          sendZeptoMail({ templateParams: params });
          emailLogEntry = { id: "el" + Date.now(), type: "payment_confirmed", to: member.email, subject: params.subject, status: "sent", timestamp: new Date().toISOString() };
        }
        // Find and mark the linked invoice as paid
        const updatedInvoices = d.invoices.map(inv =>
          inv.userId === sub?.userId && inv.status === "unpaid" &&
          sub && inv.description?.includes(sub.service.replace(/_/g, " ").split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" "))
            ? { ...inv, status: "paid" }
            : inv
        );
        return {
          ...d,
          subscriptions: d.subscriptions.map(s =>
            s.id === subId ? { ...s, status: "active", paymentConfirmed: true } : s
          ),
          invoices: updatedInvoices,
          notifications: notif ? [...d.notifications, notif] : d.notifications,
          ...(emailLogEntry ? { emailSettings: { ...es, emailLog: [...(es.emailLog || []), emailLogEntry] } } : {}),
        };
      });
      setConfirming(null);
      setSuccessMsg("Payment confirmed — subscription activated and member notified.");
      setTimeout(() => setSuccessMsg(""), 4000);
    }, 1000);
  };

  const total = pendingSubs.length + pendingBookings.length;

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Pending Payments</h2>
      <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13 }}>Members who selected Bank Transfer. Confirm each payment manually once you receive the transfer.</p>

      {successMsg && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
          <Icon name="check" size={16} color="#16A34A" /> {successMsg}
        </div>
      )}

      {total === 0 ? (
        <div style={{ background: "#F9FAFB", border: "2px dashed #E5E7EB", borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 4 }}>No pending bank transfers</div>
          <div style={{ fontSize: 13, color: "#9CA3AF" }}>All bank transfer payments have been confirmed.</div>
        </div>
      ) : (
        <>
          {/* Pending Subscriptions */}
          {pendingSubs.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                Subscription Payments ({pendingSubs.length})
              </div>
              <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "#F9FAFB" }}>
                    {["Member", "Service", "Plan", "Amount", "Subscribed On", "Action"].map(h => (
                      <th key={h} style={{ padding: "11px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {pendingSubs.map(s => {
                      const u = data.users.find(u => u.id === s.userId);
                      return (
                        <tr key={s.id} style={{ borderTop: "1px solid #F3F4F6", background: "#FFFBEB" }}>
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 30, height: 30, borderRadius: "50%", background: BRAND.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: BRAND.orange }}>{u?.name?.[0]}</div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>{u?.name}</div>
                                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u?.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "13px 16px", fontSize: 13, textTransform: "capitalize", color: "#374151" }}>{s.service.replace(/_/g, " ")}</td>
                          <td style={{ padding: "13px 16px", fontSize: 13, textTransform: "capitalize", color: "#374151" }}>{s.plan}</td>
                          <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(s.amount)}</td>
                          <td style={{ padding: "13px 16px", fontSize: 12, color: "#6B7280" }}>{formatDate(s.startDate)}</td>
                          <td style={{ padding: "13px 16px" }}>
                            <button
                              onClick={() => confirmSubPayment(s.id)}
                              disabled={confirming === s.id}
                              style={{ padding: "6px 14px", background: confirming === s.id ? "#9CA3AF" : "#DCFCE7", color: confirming === s.id ? "#fff" : "#16A34A", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: confirming === s.id ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                            >
                              {confirming === s.id ? "Confirming…" : "✓ Confirm Payment"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pending Booking Payments */}
          {pendingBookings.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                Booking Payments ({pendingBookings.length})
              </div>
              <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "#F9FAFB" }}>
                    {["Member", "Service", "Date", "Amount", "Action"].map(h => (
                      <th key={h} style={{ padding: "11px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {pendingBookings.map(b => {
                      const u = data.users.find(u => u.id === b.userId);
                      return (
                        <tr key={b.id} style={{ borderTop: "1px solid #F3F4F6", background: "#FFFBEB" }}>
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{u?.name}</div>
                            <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u?.email}</div>
                          </td>
                          <td style={{ padding: "13px 16px", fontSize: 13, textTransform: "capitalize", color: "#374151" }}>{b.service.replace(/_/g, " ")}</td>
                          <td style={{ padding: "13px 16px", fontSize: 12, color: "#6B7280" }}>{formatDate(b.date)}</td>
                          <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{formatNGN(b.amount)}</td>
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => {
                                  setData(d => {
                                    const invId = "inv" + Date.now();
                                    const inv = { id: invId, userId: b.userId, bookingId: b.id, amount: b.amount, date: new Date().toISOString().split("T")[0], status: "paid", service: b.service === "hot_desk" ? "Hot Desk" : "Meeting Room", description: b.description || b.service.replace(/_/g, " ") };
                                    const notif = { id: "n" + Date.now(), userId: b.userId, type: "info", message: `✅ Your ${b.service.replace(/_/g," ")} booking payment has been confirmed!`, read: false, date: new Date().toISOString().split("T")[0] };
                                    return { ...d, bookings: d.bookings.map(bk => bk.id === b.id ? { ...bk, status: "approved", invoiceId: invId } : bk), invoices: [...d.invoices, inv], notifications: [...d.notifications, notif] };
                                  });
                                  setSuccessMsg("Booking payment confirmed.");
                                  setTimeout(() => setSuccessMsg(""), 4000);
                                }}
                                style={{ padding: "5px 10px", background: "#DCFCE7", color: "#16A34A", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                              >✓ Confirm</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 24, background: BRAND.lightOrange, borderRadius: 12, padding: "14px 18px", fontSize: 12, color: BRAND.orange, maxWidth: 600 }}>
        <strong>How it works:</strong> When a member selects Bank Transfer at checkout, their subscription is held as <em>Awaiting Payment</em> — they cannot access services yet. Click "Confirm Payment" once you see the transfer arrive in your Hub43 bank account. The member is automatically activated and notified by email.
      </div>
    </div>
  );
};

// ─── ADMIN: ONBOARDING REPORT ─────────────────────────────────────────────────
const AdminOnboardingReport = ({ data }) => {
  const members = data.users.filter(u => u.role === "member");
  const today = new Date().toISOString().split("T")[0];

  // Build per-member funnel rows
  const rows = members.map(u => {
    const subs = data.subscriptions.filter(s => s.userId === u.id);
    const activeSubs = subs.filter(s => s.status === "active");
    const hasPaid = activeSubs.length > 0;
    const paidAt = hasPaid ? activeSubs.sort((a,b) => a.startDate.localeCompare(b.startDate))[0].startDate : null;
    const registeredAt = u.joined;
    const daysToPaid = (registeredAt && paidAt)
      ? Math.max(0, Math.ceil((new Date(paidAt) - new Date(registeredAt)) / 86400000))
      : null;
    const services = [...new Set(activeSubs.map(s => s.service.replace(/_/g," ")))];
    const totalSpend = activeSubs.reduce((s, sub) => s + sub.amount, 0);
    const stage = !hasPaid ? "registered" : "paid";
    return { user: u, hasPaid, paidAt, registeredAt, daysToPaid, services, totalSpend, stage };
  });

  // Cohort by month joined
  const cohorts = {};
  rows.forEach(r => {
    const key = r.registeredAt ? r.registeredAt.slice(0,7) : "unknown";
    if (!cohorts[key]) cohorts[key] = { month: key, registered: 0, paid: 0 };
    cohorts[key].registered++;
    if (r.hasPaid) cohorts[key].paid++;
  });
  const cohortList = Object.values(cohorts).sort((a,b) => a.month.localeCompare(b.month));

  const totalReg = rows.length;
  const totalPaid = rows.filter(r => r.hasPaid).length;
  const convRate = totalReg > 0 ? Math.round((totalPaid / totalReg) * 100) : 0;
  const avgDays = (() => {
    const dts = rows.filter(r => r.daysToPaid !== null).map(r => r.daysToPaid);
    return dts.length ? Math.round(dts.reduce((a,b) => a+b, 0) / dts.length) : 0;
  })();

  const svcCounts = {};
  rows.forEach(r => r.services.forEach(s => { svcCounts[s] = (svcCounts[s] || 0) + 1; }));

  const statCard = (label, value, color, sub) => (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || "#111" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: color, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Member Onboarding Report</h2>
      <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13 }}>Track registration-to-payment conversion, cohorts, and service uptake.</p>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {statCard("Registered", totalReg, BRAND.blue)}
        {statCard("Converted (Paid)", totalPaid, "#16A34A", `${convRate}% conversion`)}
        {statCard("Not Yet Paid", totalReg - totalPaid, BRAND.orange)}
        {statCard("Avg Days to Convert", avgDays + "d", BRAND.blue, "register → first payment")}
      </div>

      {/* Cohort table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", fontSize: 14, fontWeight: 700, color: "#374151" }}>
          Registration Cohorts
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {["Month", "Registered", "Converted", "Conversion Rate", "Still Pending"].map(h => (
              <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {cohortList.map(c => {
              const rate = c.registered > 0 ? Math.round((c.paid / c.registered) * 100) : 0;
              return (
                <tr key={c.month} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600 }}>{new Date(c.month + "-01").toLocaleDateString("en-NG", { month: "short", year: "numeric" })}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13 }}>{c.registered}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: "#16A34A" }}>{c.paid}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, maxWidth: 100, height: 6, borderRadius: 3, background: "#E5E7EB", overflow: "hidden" }}>
                        <div style={{ width: rate + "%", height: "100%", background: rate >= 70 ? "#16A34A" : rate >= 40 ? BRAND.orange : BRAND.red, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: rate >= 70 ? "#16A34A" : rate >= 40 ? BRAND.orange : BRAND.red }}>{rate}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: c.registered - c.paid > 0 ? BRAND.orange : "#9CA3AF", fontWeight: 600 }}>{c.registered - c.paid}</td>
                </tr>
              );
            })}
            {cohortList.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>No members yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Service uptake */}
      {Object.keys(svcCounts).length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 14 }}>Service Uptake</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(svcCounts).sort((a,b) => b[1]-a[1]).map(([svc, cnt]) => {
              const colors = { "hot desk": BRAND.blue, "private office": BRAND.orange, "meeting room": "#7C3AED", "virtual office": "#059669" };
              const col = colors[svc] || BRAND.blue;
              return (
                <div key={svc} style={{ background: col + "12", border: `1.5px solid ${col}33`, borderRadius: 10, padding: "10px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: col }}>{cnt}</div>
                  <div style={{ fontSize: 12, color: "#374151", textTransform: "capitalize", marginTop: 2 }}>{svc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-member table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", fontSize: 14, fontWeight: 700, color: "#374151" }}>
          All Members — Registration → Payment
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F9FAFB" }}>
            {["Member", "Registered", "First Payment", "Days to Convert", "Services", "Total Spend", "Stage"].map(h => (
              <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.user.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.user.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{r.user.email}</div>
                </td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: "#6B7280" }}>{r.registeredAt ? formatDate(r.registeredAt) : "—"}</td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: "#6B7280" }}>{r.paidAt ? formatDate(r.paidAt) : <span style={{ color: BRAND.orange }}>Not yet</span>}</td>
                <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: r.daysToPaid !== null ? BRAND.blue : "#9CA3AF" }}>
                  {r.daysToPaid !== null ? r.daysToPaid + "d" : "—"}
                </td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: "#374151", textTransform: "capitalize" }}>
                  {r.services.length > 0 ? r.services.join(", ") : <span style={{ color: "#D1D5DB" }}>None</span>}
                </td>
                <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: r.totalSpend > 0 ? BRAND.blue : "#9CA3AF" }}>
                  {r.totalSpend > 0 ? formatNGN(r.totalSpend) : "—"}
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: r.hasPaid ? "#DCFCE7" : "#FEF3C7", color: r.hasPaid ? "#16A34A" : "#92400E", textTransform: "uppercase" }}>
                    {r.hasPaid ? "Paid" : "Registered"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>No members registered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── ADMIN: EXPORT DATA ───────────────────────────────────────────────────────
const AdminExport = ({ data }) => {
  const [downloading, setDownloading] = useState(null);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

  const toCSV = (headers, rows) => {
    const esc = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
  };

  const downloadCSV = (filename, csv) => {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownload = (type) => {
    setDownloading(type);
    setTimeout(() => {
      if (type === "members_csv") {
        const headers = ["Name", "Email", "Phone", "Role", "Joined", "Active Subscriptions", "Total Spend (₦)"];
        const rows = data.users.filter(u => u.role === "member").map(u => {
          const subs = data.subscriptions.filter(s => s.userId === u.id && s.status === "active");
          const spend = data.invoices.filter(i => i.userId === u.id).reduce((a, i) => a + i.amount, 0);
          return [u.name, u.email, u.phone, u.role, u.joined, subs.length, spend];
        });
        downloadCSV("Hub43_Members.csv", toCSV(headers, rows));
      } else if (type === "revenue_csv") {
        const headers = ["Invoice ID", "Member", "Email", "Service", "Description", "Date", "Amount (₦)", "Status"];
        const filtered = data.invoices.filter(i => i.date >= dateFrom && i.date <= dateTo);
        const rows = filtered.map(i => {
          const u = data.users.find(u => u.id === i.userId);
          return [i.id, u?.name || "—", u?.email || "—", i.service, i.description, i.date, i.amount, i.status];
        });
        downloadCSV(`Hub43_Revenue_${dateFrom}_to_${dateTo}.csv`, toCSV(headers, rows));
      } else if (type === "expenses_csv") {
        const headers = ["Date", "Category", "Description", "Amount (₦)", "Payment Method", "Recorded By"];
        const filtered = data.expenses.filter(e => e.date >= dateFrom && e.date <= dateTo);
        const rows = filtered.map(e => {
          const recorder = data.users.find(u => u.id === e.recordedBy);
          return [e.date, e.category, e.description, e.amount, e.paymentMethod, recorder?.name || e.recordedBy];
        });
        downloadCSV(`Hub43_Expenses_${dateFrom}_to_${dateTo}.csv`, toCSV(headers, rows));
      } else if (type === "members_pdf") {
        const members = data.users.filter(u => u.role === "member");
        const rows = members.map(u => {
          const subs = data.subscriptions.filter(s => s.userId === u.id && s.status === "active");
          const spend = data.invoices.filter(i => i.userId === u.id).reduce((a,i) => a + i.amount, 0);
          return `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.phone || "—"}</td><td>${u.joined}</td><td>${subs.length}</td><td>₦${Number(spend).toLocaleString("en-NG")}</td></tr>`;
        }).join("");
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hub43 Members</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px}h1{color:#1E3A8A}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#EEF2FF;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6B7280}td{padding:8px 12px;border-bottom:1px solid #F3F4F6}tr:nth-child(even){background:#F9FAFB}.footer{margin-top:20px;color:#9CA3AF;font-size:10px}</style></head><body><h1>Hub43 Workspace — Member List</h1><p style="color:#6B7280;font-size:11px">Generated ${new Date().toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"})} · ${members.length} members</p><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Active Subs</th><th>Total Spend</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Hub43 Workspace Ltd — work@hub43.com</div></body></html>`;
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (w) { w.onload = () => { w.print(); }; }
      }
      setDownloading(null);
    }, 600);
  };

  const exportCard = ({ type, title, desc, badge, badgeColor }) => (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: badgeColor + "18", color: badgeColor }}>{badge}</span>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>{desc}</div>
        </div>
        <Icon name="download" size={20} color="#D1D5DB" />
      </div>
      <button
        onClick={() => handleDownload(type)}
        disabled={downloading === type}
        style={{ width: "100%", padding: "10px", background: downloading === type ? "#9CA3AF" : BRAND.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: downloading === type ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
      >
        <Icon name="download" size={14} color="#fff" />
        {downloading === type ? "Preparing…" : "Download"}
      </button>
    </div>
  );

  const inputStyle = { padding: "9px 12px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, outline: "none" };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: BRAND.blue }}>Export Data</h2>
      <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13 }}>Download member lists, revenue, and expense reports. Revenue and expense exports respect the date range below.</p>

      {/* Date range filter */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Date Range:</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "#6B7280" }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "#6B7280" }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>
          Revenue: {data.invoices.filter(i => i.date >= dateFrom && i.date <= dateTo).length} invoices ·
          Expenses: {data.expenses.filter(e => e.date >= dateFrom && e.date <= dateTo).length} entries
        </div>
      </div>

      {/* Export cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {exportCard({ type: "members_csv", title: "Member List", desc: "All registered members with contact info, subscription count, and total spend.", badge: "CSV", badgeColor: "#059669" })}
        {exportCard({ type: "members_pdf", title: "Member List", desc: "Printable HTML report with member list — opens in a new tab for printing or saving as PDF.", badge: "PDF/Print", badgeColor: BRAND.red })}
        {exportCard({ type: "revenue_csv", title: "Revenue Report", desc: `All paid invoices within the selected date range. Includes service, member, amount, and status.`, badge: "CSV", badgeColor: "#059669" })}
        {exportCard({ type: "expenses_csv", title: "Expense Report", desc: "All recorded expenses within the selected date range. Includes category, description, and amounts.", badge: "CSV", badgeColor: "#059669" })}
      </div>

      <div style={{ marginTop: 20, background: BRAND.lightBlue, borderRadius: 10, padding: "12px 16px", fontSize: 12, color: BRAND.blue }}>
        <strong>Tip:</strong> For the full Excel cashbook (cash vs. card columns), use the <strong>Export to Excel</strong> button inside the Expenses view.
      </div>
    </div>
  );
};

const loadPersistedData = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return INITIAL_DATA;
    const saved = JSON.parse(raw);
    // Merge: use saved data but fall back to INITIAL_DATA for any missing keys
    return { ...INITIAL_DATA, ...saved };
  } catch {
    return INITIAL_DATA;
  }
};
const persistData = (d) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(() => loadPersistedData());
  const [active, setActive] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);

  // ── Session state ──────────────────────────────────────────────────────────
  // Restore user from a valid session on first mount (avoids re-login after refresh)
  const [user, setUser] = useState(() => {
    const s = readSession();
    if (!s) return null;
    // We only store userId in the session; look up the full user object from data
    const allUsers = (() => {
      try {
        const raw = localStorage.getItem(LS_KEY);
        const saved = raw ? JSON.parse(raw) : {};
        return saved.users || [];
      } catch { return []; }
    })();
    return allUsers.find(u => u.id === s.userId) || null;
  });

  // ms until expiry — recalculated every second via the interval below
  const [msLeft, setMsLeft] = useState(() => {
    const s = readSession();
    return s ? Math.max(0, s.expiresAt - Date.now()) : 0;
  });
  // Whether to show the "expiring soon" warning banner
  const [showExpiryWarn, setShowExpiryWarn] = useState(false);
  // Track the last time we extended the session (to debounce activity handler)
  const lastExtendRef = useRef(0);

  // ── Persist app data whenever it changes ───────────────────────────────────
  useEffect(() => { persistData(data); }, [data]);

  // ── Pre-load Paystack inline script so it's ready before the user pays ─────
  useEffect(() => {
    if (data.paymentMethods?.paystack && data.paymentMethods?.paystackKey &&
        !data.paymentMethods.paystackKey.startsWith("pk_test_xxx")) {
      loadPaystack().catch(() => {}); // fire-and-forget; errors handled at checkout time
    }
  }, []);

  // ── Auto-generate expiry notifications and email reminders ─────────────────
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setData(d => {
      let changed = false;
      const newNotifs = [...d.notifications];
      const es = d.emailSettings || {};
      const newEmailLog = [...(es.emailLog || [])];

      d.subscriptions.filter(s => s.status === "active").forEach(s => {
        const dl = Math.max(0, Math.ceil((new Date(s.endDate) - new Date()) / 86400000));

        if (dl <= 14) {
          const alreadyHas = d.notifications.some(n =>
            n.userId === s.userId && n.type === "expiry_alert" && n.subId === s.id
          );
          if (!alreadyHas) {
            changed = true;
            newNotifs.push({
              id: "na" + s.id + Date.now(),
              userId: s.userId,
              type: "expiry_alert",
              subId: s.id,
              message: `⚠️ Your ${s.service.replace(/_/g," ")} subscription expires in ${dl} day${dl !== 1 ? "s" : ""} (${new Date(s.endDate).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}). Renew in Subscriptions to stay uninterrupted.`,
              read: false,
              date: today,
            });
          }
        }

        if ((dl === 7 || dl === 3) && es.enableExpiryReminder !== false) {
          const reminderKey = `reminder_${dl}d`;
          const alreadySent = (es.emailLog || []).some(e =>
            e.type === reminderKey && e.subId === s.id
          );
          if (!alreadySent) {
            const member = d.users.find(u => u.id === s.userId);
            if (member) {
              const params = buildEmailParams.expiryReminder({ user: member, sub: s, daysLeft: dl });
              sendZeptoMail({ templateParams: params });
              changed = true;
              newEmailLog.push({
                id: "el" + Date.now() + dl,
                type: reminderKey,
                subId: s.id,
                to: member.email,
                subject: params.subject,
                status: "sent",
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      });

      if (!changed) return d;
      return { ...d, notifications: newNotifs, emailSettings: { ...es, emailLog: newEmailLog } };
    });
  }, []); // run once on mount

  // ── Session tick: check expiry every second while logged in ────────────────
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const s = readSession();
      if (!s) { logout("expired"); return; }
      const remaining = Math.max(0, s.expiresAt - Date.now());
      setMsLeft(remaining);
      setShowExpiryWarn(remaining > 0 && remaining <= SESSION_WARN_BEFORE_MS);
      if (remaining === 0) logout("expired");
    }, 1000);
    return () => clearInterval(interval);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activity listener: extend session on any user interaction (debounced) ──
  useEffect(() => {
    if (!user) return;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastExtendRef.current < ACTIVITY_DEBOUNCE_MS) return;
      lastExtendRef.current = now;
      extendSession(user.role);
      // Update msLeft immediately so the tick sees the new expiry
      const s = readSession();
      if (s) setMsLeft(Math.max(0, s.expiresAt - Date.now()));
    };
    const events = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handleActivity));
  }, [user]);

  // ── Logout helper ──────────────────────────────────────────────────────────
  const [logoutReason, setLogoutReason] = useState(null); // null | "expired"
  const logout = (reason = null) => {
    clearSession();
    setUser(null);
    setActive("dashboard");
    setShowExpiryWarn(false);
    setMsLeft(0);
    if (reason === "expired") setLogoutReason("expired");
  };

  // ── Login handler (called by LoginPage on success) ─────────────────────────
  const handleLogin = (u) => {
    writeSession(u);
    setLogoutReason(null);
    setUser(u);
    setActive(u.role === "frontdesk" ? "fd_onboard" : "dashboard");
  };

  // ── Format ms as m:ss countdown ───────────────────────────────────────────
  const formatCountdown = (ms) => {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (!user) return (
    <LoginPage
      allUsers={data.users}
      allPasswords={data.userPasswords}
      data={data}
      setData={setData}
      onLogin={handleLogin}
      expiredSession={logoutReason === "expired"}
    />
  );

  const isAdmin = user.role === "admin";
  const isFrontDesk = user.role === "frontdesk";

  const renderContent = () => {
    if (isAdmin) {
      switch (active) {
        case "dashboard": return <AdminDashboard data={data} />;
        case "users": return <AdminUsers data={data} setData={setData} />;
        case "offices": return <AdminOffices data={data} setData={setData} />;
        case "meeting_rooms": return <MeetingRoomView user={user} data={data} setData={setData} />;
        case "bookings": return <AdminBookings data={data} setData={setData} />;
        case "virtual_offices": return <AdminVirtualOffices data={data} setData={setData} />;
        case "subscriptions": return <SubscriptionsView data={data} setData={setData} isAdmin={true} />;
        case "invoices": return <InvoicesView data={data} isAdmin={true} />;
        case "revenue": return <RevenueView data={data} />;
        case "pricing": return <AdminPricing data={data} setData={setData} />;
        case "pending_payments": return <AdminPendingPayments data={data} setData={setData} />;
        case "onboarding_report": return <AdminOnboardingReport data={data} />;
        case "export": return <AdminExport data={data} />;
        case "wifi_settings": return <AdminWifiSettings data={data} setData={setData} />;
        case "payment_settings": return <AdminPaymentSettings data={data} setData={setData} />;
        case "email_settings": return <AdminEmailSettings data={data} setData={setData} />;
        case "expenses": return <ExpensesView data={data} setData={setData} user={user} />;
        default: return <AdminDashboard data={data} />;
      }
    } else if (isFrontDesk) {
      switch (active) {
        case "fd_onboard": return <FrontDeskOnboard data={data} setData={setData} staffName={user.name} />;
        case "fd_checkins": return <FrontDeskCheckins data={data} />;
        case "fd_members": return <FrontDeskMembers data={data} />;
        case "expenses": return <ExpensesView data={data} setData={setData} user={user} />;
        case "fd_account": return <FrontDeskAccount user={user} data={data} setData={setData} />;
        default: return <FrontDeskOnboard data={data} setData={setData} staffName={user.name} />;
      }
    } else {
      switch (active) {
        case "dashboard": return <MemberDashboard user={user} data={data} setActive={setActive} />;
        case "hot_desk": return <HotDeskView user={user} data={data} setData={setData} />;
        case "private_office": return <PrivateOfficeView user={user} data={data} setData={setData} />;
        case "meeting_room": return <MeetingRoomView user={user} data={data} setData={setData} />;
        case "virtual_office": return <VirtualOfficeView user={user} data={data} setData={setData} />;
        case "my_bookings": return <MyBookings user={user} data={data} />;
        case "subscriptions": return <SubscriptionsView data={data} setData={setData} isAdmin={false} userId={user.id} />;
        case "my_invoices": return <InvoicesView data={data} isAdmin={false} userId={user.id} />;
        case "add_service": return <AddServiceView user={user} data={data} setData={setData} setActive={setActive} />;
        case "my_profile": return <MemberProfile user={user} data={data} setData={setData} setUser={setUser} />;
        default: return <MemberDashboard user={user} data={data} setActive={setActive} />;
      }
    }
  };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: "#F8FAFC" }}>
      <TopNav user={user} notifications={data.notifications} onNotifClick={() => setShowNotifs(true)} onLogout={() => logout()} sideOpen={sideOpen} setSideOpen={setSideOpen} />

      {/* Session expiry warning banner */}
      {showExpiryWarn && (
        <div style={{ background: "#FFF4EA", borderBottom: `2px solid ${BRAND.orange}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, zIndex: 99 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>⏰</span>
            <span style={{ fontSize: 13, color: "#92400E", fontWeight: 600 }}>
              Your session expires in <strong style={{ color: BRAND.red }}>{formatCountdown(msLeft)}</strong>. Any unsaved work will be lost.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { extendSession(user.role); const s = readSession(); if (s) setMsLeft(Math.max(0, s.expiresAt - Date.now())); setShowExpiryWarn(false); }}
              style={{ padding: "6px 14px", background: BRAND.blue, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Stay logged in
            </button>
            <button
              onClick={() => logout()}
              style={{ padding: "6px 14px", background: "transparent", color: "#92400E", border: `1px solid ${BRAND.orange}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Log out now
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar user={user} active={active} setActive={setActive} open={sideOpen} data={data} />
        <main style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
          {renderContent()}
        </main>
      </div>
      {showNotifs && <NotificationsPanel user={user} data={data} setData={setData} onClose={() => setShowNotifs(false)} />}
    </div>
  );
}
