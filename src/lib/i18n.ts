// Arabic translations for order statuses and common terms
export const STATUS_AR: Record<string, string> = {
  pending: "قيد الانتظار",
  accepted: "مقبول",
  preparing: "قيد التحضير",
  picked_up: "تم الاستلام",
  on_the_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
  returned: "مرتجع",
  on_hold: "معلّق",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  accepted: "bg-blue-500/20 text-blue-400",
  preparing: "bg-blue-500/20 text-blue-400",
  picked_up: "bg-purple-500/20 text-purple-400",
  on_the_way: "bg-purple-500/20 text-purple-400",
  delivered: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
  returned: "bg-muted text-muted-foreground",
  on_hold: "bg-amber-500/20 text-amber-500",
};
