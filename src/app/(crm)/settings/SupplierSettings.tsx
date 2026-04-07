"use client";

import { useState, useEffect } from "react";
import { Save, Building2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

export default function SupplierSettings() {
  const [form, setForm] = useState({
    id: "", company_name: "", inn: "", kpp: "", address: "",
    bank_name: "", bik: "", account_number: "", corr_account: "", director: "",
    stamp_url: "", signature_url: "", logo_url: "",
  });
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("supplier_settings").select("*").limit(1).single().then(({ data }) => {
      if (data) setForm(data);
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    if (form.id) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...payload } = form;
      await supabase.from("supplier_settings").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", form.id);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...payload } = form;
      const { data, error } = await supabase.from("supplier_settings").insert(payload).select("*").single();
      if (data) setForm(data);
      if (error) alert("Ошибка: " + error.message);
    }
    setSaving(false);
  }

  async function uploadImage(file: File, field: "stamp_url" | "signature_url" | "logo_url") {
    const setter = field === "stamp_url" ? setUploadingStamp : setUploadingSig;
    setter(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("field", field);
    const res = await fetch("/api/supplier/upload", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      setForm((prev) => ({ ...prev, [field]: url }));
    } else {
      const err = await res.json();
      alert("Ошибка загрузки: " + (err.error ?? ""));
    }
    setter(false);
  }

  if (loading) return <p className="text-xs py-4" style={{ color: "#aaa" }}>Загрузка...</p>;

  return (
    <section>
      <h2 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: "#333" }}>
        <Building2 size={14} /> Реквизиты поставщика (для счетов)
      </h2>
      <div className="rounded-lg p-4 space-y-3" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="grid grid-cols-2 gap-3">
          <div><label style={lblStyle}>Название ИП/ООО</label><input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} style={inputStyle} placeholder="ИП Иванов И.И." /></div>
          <div><label style={lblStyle}>Директор/ИП</label><input value={form.director} onChange={(e) => setForm({ ...form, director: e.target.value })} style={inputStyle} placeholder="Иванов Иван Иванович" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label style={lblStyle}>ИНН</label><input value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} style={inputStyle} /></div>
          <div><label style={lblStyle}>КПП</label><input value={form.kpp ?? ""} onChange={(e) => setForm({ ...form, kpp: e.target.value })} style={inputStyle} /></div>
          <div><label style={lblStyle}>Адрес</label><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label style={lblStyle}>Банк</label><input value={form.bank_name ?? ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} style={inputStyle} placeholder="АО «Тинькофф Банк»" /></div>
          <div><label style={lblStyle}>БИК</label><input value={form.bik ?? ""} onChange={(e) => setForm({ ...form, bik: e.target.value })} style={inputStyle} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label style={lblStyle}>Расчётный счёт</label><input value={form.account_number ?? ""} onChange={(e) => setForm({ ...form, account_number: e.target.value })} style={inputStyle} /></div>
          <div><label style={lblStyle}>Корр. счёт</label><input value={form.corr_account ?? ""} onChange={(e) => setForm({ ...form, corr_account: e.target.value })} style={inputStyle} /></div>
        </div>
        {/* Logo */}
        <div className="pt-2" style={{ borderTop: "1px solid #f0f0f0" }}>
          <label style={lblStyle}>Логотип (для КП и счетов)</label>
          {form.logo_url ? (
            <div className="flex items-center gap-2">
              <img src={form.logo_url} alt="Логотип" className="h-12 rounded" style={{ border: "1px solid #e0e0e0" }} />
              <label className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer hover:bg-gray-50" style={{ border: "1px solid #d0d0d0", color: "#888" }}>
                <Upload size={11} /> Заменить
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "logo_url"); }} />
              </label>
            </div>
          ) : (
            <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded cursor-pointer hover:bg-gray-50" style={{ border: "1px dashed #d0d0d0", color: "#888" }}>
              <Upload size={13} /> Загрузить логотип
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "logo_url"); }} />
            </label>
          )}
        </div>

        {/* Stamp & Signature */}
        <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: "1px solid #f0f0f0" }}>
          <div>
            <label style={lblStyle}>Печать (изображение)</label>
            {form.stamp_url ? (
              <div className="flex items-center gap-2">
                <img src={form.stamp_url} alt="Печать" className="h-16 rounded" style={{ border: "1px solid #e0e0e0" }} />
                <label className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer hover:bg-gray-50" style={{ border: "1px solid #d0d0d0", color: "#888" }}>
                  <Upload size={11} /> Заменить
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "stamp_url"); }} />
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded cursor-pointer hover:bg-gray-50" style={{ border: "1px dashed #d0d0d0", color: "#888" }}>
                <Upload size={13} /> {uploadingStamp ? "Загрузка..." : "Загрузить печать"}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingStamp} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "stamp_url"); }} />
              </label>
            )}
          </div>
          <div>
            <label style={lblStyle}>Подпись (изображение)</label>
            {form.signature_url ? (
              <div className="flex items-center gap-2">
                <img src={form.signature_url} alt="Подпись" className="h-16 rounded" style={{ border: "1px solid #e0e0e0" }} />
                <label className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer hover:bg-gray-50" style={{ border: "1px solid #d0d0d0", color: "#888" }}>
                  <Upload size={11} /> Заменить
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "signature_url"); }} />
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded cursor-pointer hover:bg-gray-50" style={{ border: "1px dashed #d0d0d0", color: "#888" }}>
                <Upload size={13} /> {uploadingSig ? "Загрузка..." : "Загрузить подпись"}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingSig} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "signature_url"); }} />
              </label>
            )}
          </div>
        </div>

        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded text-white disabled:opacity-50" style={{ background: "#0067a5" }}>
          <Save size={12} /> {saving ? "Сохранение..." : "Сохранить реквизиты"}
        </button>
      </div>
    </section>
  );
}
