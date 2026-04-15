"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import DirectorySelect from "@/components/ui/DirectorySelect";
import { createClient } from "@/lib/supabase/client";
import { getTimezoneFromRegion } from "@/components/ui/ClientTimeIndicator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function EditCompanyModal({ open, onClose, company, onSaved }: { open: boolean; onClose: () => void; company: any; onSaved: (company: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [innLoading, setInnLoading] = useState(false);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [venueTypeId, setVenueTypeId] = useState<string | null>(company?.venue_type_id ?? null);
  const [supplierId, setSupplierId] = useState<string | null>(company?.supplier_id ?? null);
  const [venueTypeName, setVenueTypeName] = useState<string>("");

  useEffect(() => {
    if (!open) { setDataReady(false); return; }
    createClient().from("users").select("id, full_name").eq("is_active", true).then(({ data }) => {
      setUsers(data ?? []);
      setDataReady(true);
    }).catch(() => { setDataReady(true); });
    setVenueTypeId(company?.venue_type_id ?? null);
    setSupplierId(company?.supplier_id ?? null);
    // Fetch venue type name for dynamic fields
    if (company?.venue_type_id) {
      createClient().from("venue_types").select("name").eq("id", company.venue_type_id).single()
        .then(({ data }) => setVenueTypeName(data?.name ?? ""));
    } else {
      setVenueTypeName("");
    }
  }, [open, company]);

  async function lookupInn(inn: string) {
    if (inn.length < 10) return;
    setInnLoading(true);
    try {
      const res = await fetch("/api/dadata/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inn }),
      });
      if (res.ok) {
        const data = await res.json();
        const form = document.querySelector("form[data-edit-company]") as HTMLFormElement;
        if (data.name) (form?.querySelector("[name=name]") as HTMLInputElement).value = data.name;
        if (data.address) (form?.querySelector("[name=legal_address]") as HTMLInputElement).value = data.address;
      }
    } catch { /* silent */ }
    setInnLoading(false);
  }

  async function handleVenueTypeChange(id: string | null) {
    setVenueTypeId(id);
    if (id) {
      const { data } = await createClient().from("venue_types").select("name").eq("id", id).single();
      setVenueTypeName(data?.name ?? "");
    } else {
      setVenueTypeName("");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data, error: err } = await supabase
      .from("companies")
      .update({
        name: fd.get("name") as string,
        inn: (fd.get("inn") as string) || null,
        ogrn: (fd.get("ogrn") as string) || null,
        kpp: (fd.get("kpp") as string) || null,
        director: (fd.get("director") as string) || null,
        city: (fd.get("city") as string) || null,
        region: (fd.get("region") as string) || null,
        legal_address: (fd.get("legal_address") as string) || null,
        actual_address: (fd.get("actual_address") as string) || null,
        delivery_address: (fd.get("delivery_address") as string) || null,
        activity: (fd.get("activity") as string) || null,
        need: (fd.get("need") as string) || null,
        company_type: (fd.get("company_type") as string) || null,
        phone: (fd.get("phone") as string) || null,
        email: (fd.get("email") as string) || null,
        website: (fd.get("website") as string) || null,
        description: (fd.get("description") as string) || null,
        assigned_to: (fd.get("assigned_to") as string) || null,
        venue_type_id: venueTypeId || null,
        supplier_id: supplierId || null,
        bathrooms_count: fd.get("bathrooms_count") ? Number(fd.get("bathrooms_count")) : null,
        rooms_count: fd.get("rooms_count") ? Number(fd.get("rooms_count")) : null,
        masters_count: fd.get("masters_count") ? Number(fd.get("masters_count")) : null,
        cabinets_count: fd.get("cabinets_count") ? Number(fd.get("cabinets_count")) : null,
        is_network: fd.get("is_network") === "on",
        network_count: fd.get("network_count") ? Number(fd.get("network_count")) : null,
        opened_recently: (fd.get("opened_recently") as string) || null,
        avg_check: fd.get("avg_check") ? Number(fd.get("avg_check")) : null,
        timezone: getTimezoneFromRegion((fd.get("city") as string) || (fd.get("region") as string) || ""),
      })
      .eq("id", company.id)
      .select("*, users!companies_assigned_to_fkey(id, full_name), venue_types(id, name), suppliers(id, name)")
      .single();

    if (err) { setError(err.message); setLoading(false); return; }

    // Cascade: if assigned_to changed, update all linked entities
    const newAssignedTo = (fd.get("assigned_to") as string) || null;
    if (newAssignedTo && newAssignedTo !== company.assigned_to) {
      await fetch("/api/responsible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cascade_company", company_id: company.id, new_assigned_to: newAssignedTo }),
      }).catch(() => {});
    }

    onSaved(data); onClose();
    setLoading(false);
  }

  const showBathrooms = venueTypeName === "Ресторан" || venueTypeName === "Салон красоты";
  const showRooms = venueTypeName === "Отель";
  const showMasters = venueTypeName === "Салон красоты";
  const showCabinets = venueTypeName === "Спа";

  return (
    <Modal open={open} onClose={onClose} title="Редактировать компанию" size="lg">
      {!dataReady ? (
        <div className="p-6 text-center text-sm text-slate-400">Загрузка...</div>
      ) : (
      <form data-edit-company onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto max-h-[80vh]">
        {error && <div className="p-3 text-sm text-red-700" style={{ background: "#fff0f0", border: "1px solid #fcc", borderRadius: 4 }}>{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Input label="ИНН" name="inn" defaultValue={company?.inn ?? ""} maxLength={12} onChange={(e) => lookupInn(e.target.value)} />
            {innLoading && <span className="absolute right-3 bottom-2 text-xs animate-pulse" style={{ color: "#0067a5" }}>Поиск...</span>}
          </div>
          <Select label="Вид компании" name="company_type" options={[
            { value: "restaurant", label: "Ресторан" },
            { value: "hotel", label: "Отель" },
            { value: "salon", label: "Салон" },
            { value: "retail", label: "Розница" },
            { value: "wholesale", label: "Опт" },
            { value: "other", label: "Другое" },
          ]} placeholder="Выберите вид" defaultValue={company?.company_type ?? ""} />
        </div>

        <Input label="Название" name="name" defaultValue={company?.name} required />

        <div className="grid grid-cols-2 gap-3">
          <DirectorySelect table="venue_types" label="Тип заведения" name="venue_type_id" defaultValue={company?.venue_type_id ?? null} onChange={handleVenueTypeChange} />
          <DirectorySelect table="suppliers" label="Текущий поставщик" name="supplier_id" defaultValue={company?.supplier_id ?? null} onChange={setSupplierId} />
        </div>

        {/* Dynamic fields based on venue type */}
        {(showBathrooms || showRooms || showMasters || showCabinets) && (
          <div className="grid grid-cols-2 gap-3">
            {showBathrooms && <Input label="Количество санузлов" name="bathrooms_count" type="number" min="0" defaultValue={company?.bathrooms_count ?? ""} />}
            {showRooms && <Input label="Количество номеров" name="rooms_count" type="number" min="0" defaultValue={company?.rooms_count ?? ""} />}
            {showMasters && <Input label="Рабочих мест мастеров" name="masters_count" type="number" min="0" defaultValue={company?.masters_count ?? ""} />}
            {showCabinets && <Input label="Количество кабинетов" name="cabinets_count" type="number" min="0" defaultValue={company?.cabinets_count ?? ""} />}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Input label="ОГРН" name="ogrn" defaultValue={company?.ogrn ?? ""} />
          <Input label="КПП" name="kpp" defaultValue={company?.kpp ?? ""} />
          <Input label="Ген. директор" name="director" defaultValue={company?.director ?? ""} />
        </div>

        <Input label="Юридический адрес" name="legal_address" defaultValue={company?.legal_address ?? ""} />
        <Input label="Фактический адрес" name="actual_address" defaultValue={company?.actual_address ?? ""} />
        <Input label="Адрес доставки" name="delivery_address" defaultValue={company?.delivery_address ?? ""} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Город" name="city" defaultValue={company?.city ?? ""} />
          <Input label="Регион" name="region" defaultValue={company?.region ?? ""} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Телефон" name="phone" type="tel" defaultValue={company?.phone ?? ""} />
          <Input label="Email" name="email" type="email" defaultValue={company?.email ?? ""} />
          <Input label="Сайт" name="website" defaultValue={company?.website ?? ""} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_network" defaultChecked={company?.is_network} style={{ accentColor: "#0067a5" }} />
            Сеть заведений
          </label>
          <Input label="Кол-во точек" name="network_count" type="number" min="1" defaultValue={company?.network_count ?? ""} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Статус</label>
            <select name="opened_recently" defaultValue={company?.opened_recently ?? ""} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">—</option>
              <option value="opening">Только открывается</option>
              <option value="working">Уже работает</option>
            </select>
          </div>
        </div>
        {(company?.company_type === "restaurant" || venueTypeName === "Ресторан") && (
          <Input label="Средний чек (₽)" name="avg_check" type="number" min="0" defaultValue={company?.avg_check ?? ""} />
        )}

        <Textarea label="Деятельность компании" name="activity" defaultValue={company?.activity ?? ""} />
        <Textarea label="Потребность" name="need" defaultValue={company?.need ?? ""} />

        <Select
          label="Ответственный"
          name="assigned_to"
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          placeholder="Выберите сотрудника"
          defaultValue={company?.assigned_to ?? ""}
        />
        <Textarea label="Описание" name="description" defaultValue={company?.description ?? ""} />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Сохранить</Button>
        </div>
      </form>
      )}
    </Modal>
  );
}
