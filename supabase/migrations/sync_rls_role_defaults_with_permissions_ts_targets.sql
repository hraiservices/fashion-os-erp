-- Targets module permission flags (accessTargets, manageLeads, manageTargets, viewAllTargets,
-- assignTasks). rls_role_defaults() mirrors src/lib/permissions.ts's ROLE_DEFAULTS; editing
-- add_rls_identity_helpers.sql alone does not re-apply it to a live database, and without the
-- new keys here has_perm('<flag>') would silently return false for every role, admin included.
-- This file deliberately sorts AFTER sync_rls_role_defaults_with_permissions_ts.sql ("." < "_"),
-- since migrations run in filename order and the older file would otherwise overwrite these keys.
CREATE OR REPLACE FUNCTION public.rls_role_defaults() RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT '{
    "admin": {
      "addOrder": true, "deleteOrder": true, "editOrder": true, "managePayments": true,
      "editMeasurements": true, "changeStage": true, "viewReports": true,
      "manageCustomers": true, "manageUsers": true, "deleteCustomers": true,
      "manageInventory": true, "managePurchases": true, "manageManufacturing": true,
      "manageSales": true, "useChatbot": true, "manageEmployees": true, "usePOS": true,
      "managePayroll": true, "manageExpenses": true, "voidSales": true,
      "manageCreditNotes": true, "cancelPurchases": true, "payVendors": true,
      "adjustStock": true, "transferStock": true, "deleteInventory": true,
      "approveLeave": true, "viewFinancialReports": true, "manageWhatsappSettings": true,
      "manageLoyaltySettings": true, "manageDocumentTemplates": true, "managePriceLists": true,
      "manageNavigationSettings": true, "viewActivityLog": true, "useCostEstimator": true,
      "backdateOrders": true, "awardLoyaltyPoints": true, "sendWhatsappBroadcast": true,
      "closeRegister": true,
      "accessTargets": true, "manageLeads": true, "manageTargets": true, "viewAllTargets": true, "assignTasks": true
    },
    "manager": {
      "addOrder": true, "deleteOrder": false, "editOrder": true, "managePayments": true,
      "editMeasurements": true, "changeStage": true, "viewReports": true,
      "manageCustomers": true, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": true, "managePurchases": true, "manageManufacturing": true,
      "manageSales": true, "useChatbot": true, "manageEmployees": true, "usePOS": true,
      "managePayroll": false, "manageExpenses": true, "voidSales": false,
      "manageCreditNotes": true, "cancelPurchases": false, "payVendors": true,
      "adjustStock": true, "transferStock": true, "deleteInventory": false,
      "approveLeave": true, "viewFinancialReports": false, "manageWhatsappSettings": false,
      "manageLoyaltySettings": false, "manageDocumentTemplates": false, "managePriceLists": false,
      "manageNavigationSettings": false, "viewActivityLog": true, "useCostEstimator": true,
      "backdateOrders": true, "awardLoyaltyPoints": true, "sendWhatsappBroadcast": true,
      "closeRegister": true,
      "accessTargets": true, "manageLeads": true, "manageTargets": true, "viewAllTargets": true, "assignTasks": true
    },
    "sales": {
      "addOrder": true, "deleteOrder": false, "editOrder": true, "managePayments": false,
      "editMeasurements": true, "changeStage": true, "viewReports": false,
      "manageCustomers": true, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": false, "managePurchases": false, "manageManufacturing": false,
      "manageSales": true, "useChatbot": false, "manageEmployees": false, "usePOS": true,
      "managePayroll": false, "manageExpenses": false, "voidSales": false,
      "manageCreditNotes": false, "cancelPurchases": false, "payVendors": false,
      "adjustStock": false, "transferStock": false, "deleteInventory": false,
      "approveLeave": false, "viewFinancialReports": false, "manageWhatsappSettings": false,
      "manageLoyaltySettings": false, "manageDocumentTemplates": false, "managePriceLists": false,
      "manageNavigationSettings": false, "viewActivityLog": false, "useCostEstimator": false,
      "backdateOrders": false, "awardLoyaltyPoints": false, "sendWhatsappBroadcast": false,
      "closeRegister": false,
      "accessTargets": true, "manageLeads": true, "manageTargets": false, "viewAllTargets": false, "assignTasks": false
    },
    "tailor": {
      "addOrder": false, "deleteOrder": false, "editOrder": false, "managePayments": false,
      "editMeasurements": false, "changeStage": true, "viewReports": false,
      "manageCustomers": false, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": false, "managePurchases": false, "manageManufacturing": true,
      "manageSales": false, "useChatbot": false, "manageEmployees": false, "usePOS": false,
      "managePayroll": false, "manageExpenses": false, "voidSales": false,
      "manageCreditNotes": false, "cancelPurchases": false, "payVendors": false,
      "adjustStock": false, "transferStock": false, "deleteInventory": false,
      "approveLeave": false, "viewFinancialReports": false, "manageWhatsappSettings": false,
      "manageLoyaltySettings": false, "manageDocumentTemplates": false, "managePriceLists": false,
      "manageNavigationSettings": false, "viewActivityLog": false, "useCostEstimator": false,
      "backdateOrders": false, "awardLoyaltyPoints": false, "sendWhatsappBroadcast": false,
      "closeRegister": false,
      "accessTargets": true, "manageLeads": false, "manageTargets": false, "viewAllTargets": false, "assignTasks": false
    }
  }'::jsonb;
$fn$;
