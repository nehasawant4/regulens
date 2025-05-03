import ExcelJS from "exceljs";
import { saveAs } from "file-saver";



// Use GPT to make the issue actionable
export async function makeActionable(issue) {
  if (!issue || typeof issue !== 'string') return '⚠️ No issue provided';

  try {
    const response = await fetch('http://127.0.0.1:5050/make_actionable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ issue }), // this must match Flask's expected schema
    });

    const data = await response.json();
    if (response.ok && data.action) {
      return data.action;
    } else {
      console.warn("Response error:", data);
      return '⚠️ Could not generate action';
    }
  } catch (error) {
    console.error("Error calling make_actionable API:", error);
    return '⚠️ Request failed';
  }
}




// Download Excel checklist with actionable items
export async function downloadChecklist(nonCompliantRules) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("FDA Checklist");

  // Headers
  sheet.columns = [
    { header: "Done", key: "done", width: 10 },
    { header: "Action Item", key: "action", width: 80 }
  ];

  for (const rule of nonCompliantRules) {
    let issues = [];
    if (Array.isArray(rule.potential_issues)) {
      issues = rule.potential_issues;
    } else if (typeof rule.potential_issues === 'string') {
      issues = [rule.potential_issues];
    } else if (typeof rule.potential_issue === 'string') {
      issues = [rule.potential_issue];
    }
  
    for (const issue of issues) {
      const action = await makeActionable(issue);
      sheet.addRow({
        done: false,
        action
      });
    }
  }

  // Add dropdown validation
  sheet.getColumn("done").eachCell((cell, rowNumber) => {
    if (rowNumber > 1) {
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"TRUE,FALSE"'],
        showDropDown: true
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), "FDA_Checklist.xlsx");
}


// Button component for checklist download
export function DownloadChecklistButton({ nonCompliantRules }) {
  return (
    <button onClick={() => downloadChecklist(nonCompliantRules)} style={{ marginTop: '20px' }}>
      Download Checklist
    </button>
  );
}