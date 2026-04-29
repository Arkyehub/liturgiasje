import { useState, useCallback } from "react"
import { BirthdayInfo } from "@/domain/models/UserProfile"
import { makeListBirthdays } from "@/main/factories/usecases/user"

export function useUser() {
  const [birthdays, setBirthdays] = useState<BirthdayInfo[]>([])

  const loadBirthdays = useCallback(async () => {
    try {
      const data = await makeListBirthdays().execute()
      setBirthdays(data)
    } catch (error) {
      console.error(error)
    }
  }, [])

  return {
    birthdays,
    loadBirthdays
  }
}
