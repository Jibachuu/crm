"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import DirectorySelect from "@/components/ui/DirectorySelect";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CreateCompanyModal({ open, onClose, users, onCreated }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [innLoading, setInnLoading] = useState(false);
  const [venueTypeId, setVenueTypeId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [venueTypeName, setVenueTypeName] = useState<string>("");

  async function handleVenueTypeChange(id: string | null) {
    setVenueTypeId(id);
    if (id) {
      const { data } = await createClient().from("venue_types").select("name").eq("id", id).single();
      setVenueTypeName(data?.name ?? "");
    } else {
      setVenueTypeName("");
    }
  }

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
        const form = document.querySelector("form[data-create-company]") as HTMLFormElement;
        if (data.name) (form?.querySelector("[name=name]") as HTMLInputElement).value = data.name;
        if (data.address) (form?.querySelector("[name=legal_address]") as HTMLInputElement).value = data.address;
        // Backlog v6 §3.1: KPP/OGRN were dropped from DaData autofill — only
        // name + address were piped through. Now bring them in too, so the
        // operator doesn't have to re-type when issuing an invoice.
        if (data.kpp) {
          const kppInput = form?.querySelector("[name=kpp]") as HTMLInputElement | null;
          if (kppInput) kppInput.value = data.kpp;
        }
        if (data.ogrn) {
          const ogrnInput = form?.querySelector("[name=ogrn]") as HTMLInputElement | null;
          if (ogrnInput) ogrnInput.value = data.ogrn;
        }
      }
    } catch { /* silent */ }
    setInnLoading(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error: err } = await supabase
      .from("companies")
      .insert({
        name: fd.get("name") as string,
        inn: (fd.get("inn") as string) || null,
        ogrn: (fd.get("ogrn") as string) || null,
        kpp: (fd.get("kpp") as string) || null,
        director: (fd.get("director") as string) || null,
        city: (fd.get("city") as string) || null,
        region: (fd.get("region") as string) || null,
        legal_address: (fd.get("legal_address") as string) || null,
        actual_address: (fd.get("actual_address") as string) || null,
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
        created_by: user.id,
      })
      .select("*, users!companies_assigned_to_fkey(id, full_name), venue_types(id, name), suppliers(id, name)")
      .single();

    if (err) setError(err.message);
    else { onCreated(data); onClose(); }
    setLoading(false);
  }

  const userOptions = users.map((u: { id: string; full_name?: string }) => ({ value: u.id, label: u.full_name }));
  const showBathrooms = venueTypeName === "Ресторан" || venueTypeName === "Салон красоты";
  const showRooms = venueTypeName === "Отель";
  const showMasters = venueTypeName === "Салон красоты";
  const showCabinets = venueTypeName === "Спа";

  return (
    <Modal open={open} onClose={onClose} title="Новая компания" size="lg">
      <form data-create-company onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto max-h-[80vh]">
        {error && <div className="p-3 text-sm text-red-700" style={{ background: "#fff0f0", border: "1px solid #fcc", borderRadius: 4 }}>{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Input label="ИНН" name="inn" placeholder="0000000000" maxLength={12} onChange={(e) => lookupInn(e.target.value)} />
            {innLoading && <span className="absolute right-3 bottom-2 text-xs animate-pulse" style={{ color: "#0067a5" }}>Поиск...</span>}
          </div>
          <Select label="Вид компании" name="company_type" options={[
            { value: "restaurant", label: "Ресторан" },
            { value: "hotel", label: "Отель" },
            { value: "salon", label: "Салон" },
            { value: "retail", label: "Розница" },
            { value: "wholesale", label: "Опт" },
            { value: "other", label: "Другое" },
          ]} placeholder="Выберите вид" />
        </div>

        <Input label="Название" name="name" placeholder="ООО «Компания»" required />

        <div className="grid grid-cols-2 gap-3">
          <DirectorySelect table="venue_types" label="Тип заведения" name="venue_type_id" onChange={handleVenueTypeChange} />
          <DirectorySelect table="suppliers" label="Текущий поставщик" name="supplier_id" onChange={setSupplierId} />
        </div>

        {(showBathrooms || showRooms || showMasters || showCabinets) && (
          <div className="grid grid-cols-2 gap-3">
            {showBathrooms && <Input label="Количество санузлов" name="bathrooms_count" type="number" min="0" />}
            {showRooms && <Input label="Количество номеров" name="rooms_count" type="number" min="0" />}
            {showMasters && <Input label="Рабочих мест мастеров" name="masters_count" type="number" min="0" />}
            {showCabinets && <Input label="Количество кабинетов" name="cabinets_count" type="number" min="0" />}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Input label="ОГРН" name="ogrn" />
          <Input label="КПП" name="kpp" />
          <Input label="Ген. директор" name="director" />
        </div>

        <Input label="Юридический адрес" name="legal_address" placeholder="г. Москва, ул. Пушкина..." />
        <Input label="Фактический адрес" name="actual_address" />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Город" name="city" />
          <Input label="Регион" name="region" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Телефон" name="phone" type="tel" placeholder="+7 (999) 000-00-00" />
          <Input label="Email" name="email" type="email" />
          <Input label="Сайт" name="website" />
        </div>

        <Textarea label="Деятельность компании" name="activity" />
        <Textarea label="Потребность" name="need" />

        <Select label="Ответственный" name="assigned_to" options={userOptions} placeholder="Выберите сотрудника" />
        <Textarea label="Описание" name="description" />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Создать компанию</Button>
        </div>
      </form>
    </Modal>
  );
}
