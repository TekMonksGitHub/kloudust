/**
 * Automation to create teams and add VMs to them.
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

async function exec(params, kdcmd) {
    const [vmsperteam, userids, clonedvmname] = [...params];
    const teamlogins = userids.split(",").map(e => e.trim());
    let result; for (const team of teamlogins) {
        const safeTeamName = team.replace(/[^a-zA-Z0-9]+/g, "");
        const newProject = `Prj_${safeTeamName.length > 5 ? safeTeamName.substring(0, 5) : safeTeamName}`;  // the new project for this team
        result = (await kdcmd(`"addProject" "${newProject}" "Createteams automated project for ${team}"`)).result;
        if (!result) break;
        result = (await kdcmd(`"addUserToProject" "${team}" "${newProject}"`)).result;    // add user so they can access
        if (!result) break;

        for (let i = 0; i < (parseInt(vmsperteam)||1); i++) {    // clone the VM in the new project as many VMs as needed
            result = (await kdcmd(`"cloneVM" "${clonedvmname}" "c${clonedvmname}" "${newProject}"`)).result;
            if (!result) break;
        }
    }

    return result;
}

export const createteams = {exec};