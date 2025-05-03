import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// Utility to convert an issue string into an actionable checklist item
export function makeActionable(issue) {
  if (!issue) return '';
  let action = issue;
  action = action.replace(/The document does not specify/gi, 'Add specification for');
  action = action.replace(/The document does not/gi, 'Update SOP to');
  action = action.replace(/^Issue in SOP:/i, '').trim();
  // Further Gemini API logic can be plugged here
  return action;
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

  // Add rows
  nonCompliantRules.forEach(rule => {
    sheet.addRow({
      done: false, // ExcelJS supports checkboxes as booleans
      action: makeActionable(rule.issue)
    });
  });

  // Set checkbox for 'Done' column

sheet.getColumn("done").eachCell((cell, rowNumber) => {
    if (rowNumber > 1) {
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"TRUE,FALSE"'], // options in dropdown
        showDropDown: true
      };
    }
  });  

  // Download
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