import { useState } from "react";
import { useModalFocus } from "../../shared/components/useModalFocus";

type SalaryCalculatorModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function SalaryCalculatorModal({ isOpen, onClose }: SalaryCalculatorModalProps) {
  const dialogRef = useModalFocus<HTMLElement>(isOpen, onClose);
  const [grossInput, setGrossInput] = useState<number>(25000000);
  const [dependents, setDependents] = useState<number>(0);
  const [region, setRegion] = useState<number>(1); // Vùng 1

  if (!isOpen) return null;

  // Constants 2026
  const BASE_SALARY = 2340000;
  const CAP_BHXH_BHYT = BASE_SALARY * 20; // 46,800,000
  const REGION_MIN_WAGE: Record<number, number> = {
    1: 4960000,
    2: 4410000,
    3: 3860000,
    4: 3450000
  };
  const CAP_BHTN = (REGION_MIN_WAGE[region] || 4960000) * 20;

  // Insurance calculation
  const salaryForSocial = Math.min(grossInput, CAP_BHXH_BHYT);
  const salaryForUnemployment = Math.min(grossInput, CAP_BHTN);

  const bhxh = salaryForSocial * 0.08;
  const bhyt = salaryForSocial * 0.015;
  const bhtn = salaryForUnemployment * 0.01;
  const totalInsurance = bhxh + bhyt + bhtn;

  // Personal Income Tax (PIT) calculation
  const selfDeduction = 11000000;
  const dependentDeduction = dependents * 4400000;
  const totalDeduction = selfDeduction + dependentDeduction + totalInsurance;

  const taxableIncome = Math.max(0, grossInput - totalDeduction);

  // Progressive Tax brackets
  function calculatePit(income: number) {
    if (income <= 0) return 0;
    if (income <= 5000000) return income * 0.05;
    if (income <= 10000000) return 5000000 * 0.05 + (income - 5000000) * 0.1;
    if (income <= 18000000) return 5000000 * 0.05 + 5000000 * 0.1 + (income - 10000000) * 0.15;
    if (income <= 32000000) return 5000000 * 0.05 + 5000000 * 0.1 + 8000000 * 0.15 + (income - 18000000) * 0.2;
    if (income <= 52000000) return 5000000 * 0.05 + 5000000 * 0.1 + 8000000 * 0.15 + 14000000 * 0.2 + (income - 32000000) * 0.25;
    if (income <= 80000000) return 5000000 * 0.05 + 5000000 * 0.1 + 8000000 * 0.15 + 14000000 * 0.2 + 20000000 * 0.25 + (income - 52000000) * 0.3;
    return 5000000 * 0.05 + 5000000 * 0.1 + 8000000 * 0.15 + 14000000 * 0.2 + 20000000 * 0.25 + 28000000 * 0.3 + (income - 80000000) * 0.35;
  }

  const pit = calculatePit(taxableIncome);
  const netSalary = Math.round(grossInput - totalInsurance - pit);

  function formatMoney(num: number) {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Math.round(num));
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card portal-salary-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="salary-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <div className="modal-title-with-icon">
            <span className="calc-emoji">🧮</span>
            <div>
              <h2 id="salary-modal-title" className="portal-modal-title">
                Công cụ tính lương Gross ➔ Net
              </h2>
              <p className="modal-subtitle">Ước tính theo cấu hình của công cụ; cần đối chiếu quy định áp dụng.</p>
            </div>
          </div>
          <button type="button" className="close-x-btn" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="salary-calc-grid">
          {/* Input side */}
          <div className="salary-inputs-col">
            <label className="input-label">
              <span>Thu nhập GROSS (VND/tháng)</span>
              <input
                data-modal-autofocus
                type="number"
                className="salary-number-input"
                value={grossInput}
                step={500000}
                min={0}
                max={1000000000000}
                onChange={(e) => {
                  const amount = Number(e.target.value);
                  setGrossInput(Number.isFinite(amount) ? Math.max(0, Math.min(amount, 1000000000000)) : 0);
                }}
              />
            </label>

            <div className="input-row-2">
              <label className="input-label">
                <span>Người phụ thuộc</span>
                <div className="counter-row">
                  <button
                    type="button"
                    className="counter-btn"
                    onClick={() => setDependents(Math.max(0, dependents - 1))}
                  >
                    -
                  </button>
                  <span className="counter-val">{dependents}</span>
                  <button
                    type="button"
                    className="counter-btn"
                    onClick={() => setDependents(dependents + 1)}
                  >
                    +
                  </button>
                </div>
              </label>

              <label className="input-label">
                <span>Vùng áp dụng</span>
                <select
                  className="salary-select-input"
                  value={region}
                  onChange={(e) => setRegion(Number(e.target.value))}
                >
                  <option value={1}>Vùng I (Hà Nội, TP.HCM)</option>
                  <option value={2}>Vùng II (Đà Nẵng, Hải Phòng)</option>
                  <option value={3}>Vùng III (Tỉnh lỵ)</option>
                  <option value={4}>Vùng IV (Nông thôn)</option>
                </select>
              </label>
            </div>

            <div className="salary-result-box">
              <span className="result-label">LƯƠNG THỰC NHẬN (NET)</span>
              <strong className="result-amount">{formatMoney(netSalary)}</strong>
              <small className="result-note">
                (Đã trừ các khoản bảo hiểm bắt buộc & thuế thu nhập cá nhân)
              </small>
            </div>
          </div>

          {/* Breakdown side */}
          <div className="salary-breakdown-col">
            <h4 className="breakdown-title">Chi tiết các khoản khấu trừ</h4>
            <ul className="breakdown-list">
              <li>
                <span>Lương Gross:</span>
                <strong>{formatMoney(grossInput)}</strong>
              </li>
              <li>
                <span>BHXH (8.0%):</span>
                <span className="text-red">-{formatMoney(bhxh)}</span>
              </li>
              <li>
                <span>BHYT (1.5%):</span>
                <span className="text-red">-{formatMoney(bhyt)}</span>
              </li>
              <li>
                <span>BHTN (1.0%):</span>
                <span className="text-red">-{formatMoney(bhtn)}</span>
              </li>
              <li className="sep-item">
                <span>Thu nhập trước thuế:</span>
                <strong>{formatMoney(grossInput - totalInsurance)}</strong>
              </li>
              <li>
                <span>Giảm trừ gia cảnh:</span>
                <span className="text-muted">-{formatMoney(selfDeduction + dependentDeduction)}</span>
              </li>
              <li>
                <span>Thu nhập tính thuế:</span>
                <span>{formatMoney(taxableIncome)}</span>
              </li>
              <li>
                <span>Thuế TNCN (PIT):</span>
                <span className="text-red">-{formatMoney(pit)}</span>
              </li>
              <li className="final-net-item">
                <span>LƯƠNG NET THỰC LĨNH:</span>
                <span className="text-primary-net">{formatMoney(netSalary)}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="modal-footer-action">
          <button type="button" className="close-pill-btn" onClick={onClose}>
            Hoàn tất
          </button>
        </div>
      </section>
    </div>
  );
}
