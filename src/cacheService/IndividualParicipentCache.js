class IndividualParticipantCache {
  constructor(db) {
    this.db = db;
  }
  

  save(data) {
    const stmt = this.db.prepare(`
      INSERT INTO individual_participants
        (screen_name, cycle, total_voltage, total_amperage, total_power,
         participant_name, profile_image, participant_voltage,
         participant_amperage, participant_power, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.screen_name, data.cycle, data.total_voltage, data.total_amperage,
      data.total_power, data.participant_name, data.profile_image ?? null,
      data.participant_voltage, data.participant_amperage,
      data.participant_power, data.ts
    );
    return { id: Number(result.lastInsertRowid) };
  }

  getByCycle(cycle) {
    const stmt = this.db.prepare(
      "SELECT * FROM individual_participants WHERE cycle = ?"
    );
    return stmt.all(cycle);
  }

  deleteByCycle(cycle) {
    const stmt = this.db.prepare(
      "DELETE FROM individual_participants WHERE cycle = ?"
    );
    const result = stmt.run(cycle);
    return { deleted: result.changes };
  }

  getAll() {
    const stmt = this.db.prepare("SELECT * FROM individual_participants");
    // console.log(stmt.all())
    return stmt.all();
  }
}

export default IndividualParticipantCache;