import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import { Card, CardBody } from "@/components/ui/Card";
import { Users, Handshake, ContactRound, Building2, TrendingUp, CheckSquare } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

async function getDashboardStats() {
  const supabase = await createClient();
  const [leads, deals, contacts, companies, tasks] = await Promise.all([
    supabase.from("leads").select("id, status", { count: "exact" }),
    supabase.from("deals").select("id, stage, amount"),
    supabase.from("contacts").select("id", { count: "exact" }),
    supabase.from("companies").select("id", { count: "exact" }),
    supabase.from("tasks").select("id, status", { count: "exact" }).neq("status", "done"),
  ]);

  const wonDeals = deals.data?.filter((d) => d.stage === "won") ?? [];
  const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  return {
    leads: leads.count ?? 0,
    newLeads: leads.data?.filter((l) => l.status === "new").length ?? 0,
    deals: deals.data?.length ?? 0,
    wonDeals: wonDeals.length,
    totalRevenue,
    contacts: contacts.count ?? 0,
    companies: companies.count ?? 0,
    pendingTasks: tasks.count ?? 0,
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const statCards = [
    {
      title: "Лиды",
      value: stats.leads,
      sub: `${stats.newLeads} новых`,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/leads",
    },
    {
      title: "Сделки",
      value: stats.deals,
      sub: `${stats.wonDeals} выиграно`,
      icon: Handshake,
      color: "text-green-600",
      bg: "bg-green-50",
      href: "/deals",
    },
    {
      title: "Выручка",
      value: formatCurrency(stats.totalRevenue),
      sub: "по закрытым сделкам",
      icon: TrendingUp,
      color: "text-purple-600",
      bg: "bg-purple-50",
      href: "/analytics",
    },
    {
      title: "Контакты",
      value: stats.contacts,
      sub: "в базе",
      icon: ContactRound,
      color: "text-orange-600",
      bg: "bg-orange-50",
      href: "/contacts",
    },
    {
      title: "Компании",
      value: stats.companies,
      sub: "в базе",
      icon: Building2,
      color: "text-cyan-600",
      bg: "bg-cyan-50",
      href: "/companies",
    },
    {
      title: "Задачи",
      value: stats.pendingTasks,
      sub: "активных",
      icon: CheckSquare,
      color: "text-red-600",
      bg: "bg-red-50",
      href: "/tasks",
    },
  ];

  return (
    <>
      <Header title="Дашборд" />
      <main className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.title} href={card.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 mb-1">{card.title}</p>
                        <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                        <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.bg}`}>
                        <Icon size={22} className={card.color} />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentLeads />
          <RecentDeals />
        </div>
      </main>
    </>
  );
}

async function RecentLeads() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, title, status, created_at, contacts(full_name)")
    .order("created_at", { ascending: false })
    .limit(5);

  const statusLabels: Record<string, string> = {
    new: "Новый",
    in_progress: "В работе",
    qualified: "Квалифицирован",
    unqualified: "Не подходит",
    converted: "Конвертирован",
  };
  const statusColors: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    qualified: "bg-green-100 text-green-700",
    unqualified: "bg-slate-100 text-slate-600",
    converted: "bg-purple-100 text-purple-700",
  };

  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Последние лиды</h3>
        <Link href="/leads" className="text-sm text-blue-600 hover:underline">Все лиды →</Link>
      </div>
      <CardBody className="p-0">
        {!data?.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Лиды не найдены</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{lead.title}</p>
                    <p className="text-xs text-slate-400">
                      {/* @ts-expect-error joined relation */}
                      {lead.contacts?.full_name ?? "Без контакта"}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                    {statusLabels[lead.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

async function RecentDeals() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deals")
    .select("id, title, stage, amount, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const stageLabels: Record<string, string> = {
    lead: "Лид",
    proposal: "Предложение",
    negotiation: "Переговоры",
    order_assembly: "Сборка заказа",
    won: "Выиграна",
    lost: "Проиграна",
  };
  const stageColors: Record<string, string> = {
    lead: "bg-slate-100 text-slate-600",
    proposal: "bg-blue-100 text-blue-700",
    negotiation: "bg-yellow-100 text-yellow-700",
    order_assembly: "bg-purple-100 text-purple-700",
    won: "bg-green-100 text-green-700",
    lost: "bg-red-100 text-red-700",
  };

  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Последние сделки</h3>
        <Link href="/deals" className="text-sm text-blue-600 hover:underline">Все сделки →</Link>
      </div>
      <CardBody className="p-0">
        {!data?.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Сделки не найдены</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((deal) => (
              <li key={deal.id}>
                <Link
                  href={`/deals/${deal.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{deal.title}</p>
                    <p className="text-xs text-slate-400">{formatCurrency(deal.amount)}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColors[deal.stage]}`}>
                    {stageLabels[deal.stage]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
